import { InternalModuleDeclaration } from "@medusajs/modules-sdk"
import {
  BulkUpdateInventoryLevelInput,
  Context,
  CreateInventoryItemInput,
  CreateInventoryLevelInput,
  CreateReservationItemInput,
  DAL,
  FilterableInventoryItemProps,
  FilterableInventoryLevelProps,
  FilterableReservationItemProps,
  FindConfig,
  IInventoryService,
  InventoryItemDTO,
  InventoryLevelDTO,
  MODULE_RESOURCE_TYPE,
  ReservationItemDTO,
  SharedContext,
  UpdateInventoryLevelInput,
  UpdateReservationItemInput,
} from "@medusajs/types"
import {
  InjectEntityManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
} from "@medusajs/utils"
import InventoryItemService from "./inventory-item"
import InventoryLevelService from "./inventory-level"
import ReservationItemService from "./reservation-item"
import { shouldForceTransaction } from "../utils"

type InjectedDependencies = {
  manager: any
  inventoryItemService: InventoryItemService
  inventoryLevelService: InventoryLevelService
  reservationItemService: ReservationItemService
  baseRepository: DAL.RepositoryService
}

export default class InventoryService implements IInventoryService {
  protected readonly manager_: any
  protected baseRepository_: DAL.RepositoryService

  protected readonly inventoryItemService_: InventoryItemService
  protected readonly reservationItemService_: ReservationItemService
  protected readonly inventoryLevelService_: InventoryLevelService

  constructor(
    {
      manager,
      inventoryItemService,
      inventoryLevelService,
      reservationItemService,
      baseRepository,
    }: InjectedDependencies,
    options?: unknown,
    protected readonly moduleDeclaration?: InternalModuleDeclaration
  ) {
    this.manager_ = manager
    this.inventoryItemService_ = inventoryItemService
    this.inventoryLevelService_ = inventoryLevelService
    this.reservationItemService_ = reservationItemService
    this.baseRepository_ = baseRepository
  }

  /**
   * Lists inventory items that match the given selector
   * @param selector - the selector to filter inventory items by
   * @param config - the find configuration to use
   * @param context
   * @return A tuple of inventory items and their total count
   */
  async listInventoryItems(
    selector: FilterableInventoryItemProps,
    config: FindConfig<InventoryItemDTO> = { relations: [], skip: 0, take: 10 },
    context: Context = {}
  ): Promise<[InventoryItemDTO[], number]> {
    return await this.inventoryItemService_.listAndCount(
      selector,
      config,
      context
    )
  }

  /**
   * Lists inventory levels that match the given selector
   * @param selector - the selector to filter inventory levels by
   * @param config - the find configuration to use
   * @param context
   * @return A tuple of inventory levels and their total count
   */
  async listInventoryLevels(
    selector: FilterableInventoryLevelProps,
    config: FindConfig<InventoryLevelDTO> = {
      relations: [],
      skip: 0,
      take: 10,
    },
    context: Context = {}
  ): Promise<[InventoryLevelDTO[], number]> {
    return await this.inventoryLevelService_.listAndCount(
      selector,
      config,
      context
    )
  }

  /**
   * Lists reservation items that match the given selector
   * @param selector - the selector to filter reservation items by
   * @param config - the find configuration to use
   * @param context
   * @return A tuple of reservation items and their total count
   */
  async listReservationItems(
    selector: FilterableReservationItemProps,
    config: FindConfig<ReservationItemDTO> = {
      relations: [],
      skip: 0,
      take: 10,
    },
    context: Context = {}
  ): Promise<[ReservationItemDTO[], number]> {
    return await this.reservationItemService_.listAndCount(
      selector,
      config,
      context
    )
  }

  /**
   * Retrieves an inventory item with the given id
   * @param inventoryItemId - the id of the inventory item to retrieve
   * @param config - the find configuration to use
   * @param context
   * @return The retrieved inventory item
   */
  async retrieveInventoryItem(
    inventoryItemId: string,
    config?: FindConfig<InventoryItemDTO>,
    context: Context = {}
  ): Promise<InventoryItemDTO> {
    const inventoryItem = await this.inventoryItemService_.retrieve(
      inventoryItemId,
      config,
      context
    )
    return { ...inventoryItem }
  }

  /**
   * Retrieves an inventory level for a given inventory item and location
   * @param inventoryItemId - the id of the inventory item
   * @param locationId - the id of the location
   * @param context
   * @return the retrieved inventory level
   */
  async retrieveInventoryLevel(
    inventoryItemId: string,
    locationId: string,
    context: Context = {}
  ): Promise<InventoryLevelDTO> {
    const [inventoryLevel] = await this.inventoryLevelService_.list(
      { inventory_item_id: inventoryItemId, location_id: locationId },
      { take: 1 },
      context
    )
    if (!inventoryLevel) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Inventory level for item ${inventoryItemId} and location ${locationId} not found`
      )
    }
    return inventoryLevel
  }

  /**
   * Retrieves a reservation item
   * @param reservationId
   * @param context
   * @param reservationId
   * @param context
   */
  async retrieveReservationItem(
    reservationId: string,
    context: Context = {}
  ): Promise<ReservationItemDTO> {
    return await this.reservationItemService_.retrieve(
      reservationId,
      undefined,
      context
    )
  }

  private async ensureInventoryLevels(
    data: { location_id: string; inventory_item_id: string }[],
    context: Context = {}
  ): Promise<InventoryLevelDTO[]> {
    const inventoryLevels = await this.inventoryLevelService_.list(
      {
        inventory_item_id: data.map((e) => e.inventory_item_id),
        location_id: data.map((e) => e.location_id),
      },
      {},
      context
    )

    const inventoryLevelMap: Map<
      string,
      Map<string, InventoryLevelDTO>
    > = inventoryLevels.reduce((acc, curr) => {
      const inventoryLevelMap = acc.get(curr.inventory_item_id) ?? new Map()
      inventoryLevelMap.set(curr.location_id, curr)
      acc.set(curr.inventory_item_id, inventoryLevelMap)
      return acc
    }, new Map())

    const missing = data.filter(
      (i) => !inventoryLevelMap.get(i.inventory_item_id)?.get(i.location_id)
    )

    if (missing.length) {
      const error = missing
        .map((missing) => {
          return `Item ${missing.inventory_item_id} is not stocked at location ${missing.location_id}`
        })
        .join(", ")
      throw new MedusaError(MedusaError.Types.NOT_FOUND, error)
    }

    return inventoryLevels.map(
      (i) => inventoryLevelMap.get(i.inventory_item_id)!.get(i.location_id)!
    )
  }

  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async createReservationItems(
    input: CreateReservationItemInput[],
    @MedusaContext() context: Context = {}
  ): Promise<ReservationItemDTO[]> {
    await this.ensureInventoryLevels(input, context)

    return await this.reservationItemService_.create(input, context)
  }

  /**
   * Creates a reservation item
   * @param input - the input object
   * @return The created reservation item
   */

  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async createReservationItem(
    input: CreateReservationItemInput,
    @MedusaContext() context: Context = {}
  ): Promise<ReservationItemDTO> {
    const [result] = await this.createReservationItems([input], context)

    return result
  }

  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async createInventoryItems(
    input: CreateInventoryItemInput[],
    @MedusaContext() context: Context = {}
  ): Promise<InventoryItemDTO[]> {
    return await this.inventoryItemService_.create(input, context)
  }

  /**
   * Creates an inventory item
   * @param input - the input object
   * @param context
   * @return The created inventory item
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async createInventoryItem(
    input: CreateInventoryItemInput,
    @MedusaContext() context: Context = {}
  ): Promise<InventoryItemDTO> {
    const [result] = await this.createInventoryItems([input], context)

    return result
  }

  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async createInventoryLevels(
    input: CreateInventoryLevelInput[],
    @MedusaContext() context: Context = {}
  ): Promise<InventoryLevelDTO[]> {
    return await this.inventoryLevelService_.create(input, context)
  }

  /**
   * Creates an inventory item
   * @param input - the input object
   * @param context
   * @return The created inventory level
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async createInventoryLevel(
    input: CreateInventoryLevelInput,
    @MedusaContext() context: Context = {}
  ): Promise<InventoryLevelDTO> {
    const [result] = await this.createInventoryLevels([input], context)

    return result
  }

  /**
   * Updates an inventory item
   * @param inventoryItemId - the id of the inventory item to update
   * @param input - the input object
   * @param context
   * @return The updated inventory item
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async updateInventoryItem(
    inventoryItemId: string,
    input: Partial<CreateInventoryItemInput>,
    @MedusaContext() context: Context = {}
  ): Promise<InventoryItemDTO> {
    const inventoryItem = await this.inventoryItemService_.update(
      inventoryItemId,
      input,
      context
    )
    return { ...inventoryItem }
  }

  /**
   * Deletes an inventory item
   * @param inventoryItemId - the id of the inventory item to delete
   * @param context
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async deleteInventoryItem(
    inventoryItemId: string | string[],
    @MedusaContext() context: Context = {}
  ): Promise<void> {
    await this.inventoryLevelService_.deleteByInventoryItemId(
      inventoryItemId,
      context
    )

    return await this.inventoryItemService_.delete(inventoryItemId, context)
  }

  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async deleteInventoryItemLevelByLocationId(
    locationId: string | string[],
    @MedusaContext() context: Context = {}
  ): Promise<void> {
    return await this.inventoryLevelService_.deleteByLocationId(
      locationId,
      context
    )
  }

  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async deleteReservationItemByLocationId(
    locationId: string | string[],
    @MedusaContext() context: Context = {}
  ): Promise<void> {
    return await this.reservationItemService_.deleteByLocationId(
      locationId,
      context
    )
  }

  /**
   * Deletes an inventory level
   * @param inventoryItemId - the id of the inventory item associated with the level
   * @param locationId - the id of the location associated with the level
   * @param context
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async deleteInventoryLevel(
    inventoryItemId: string,
    locationId: string,
    @MedusaContext() context: Context = {}
  ): Promise<void> {
    const [inventoryLevel] = await this.inventoryLevelService_.list(
      { inventory_item_id: inventoryItemId, location_id: locationId },
      { take: 1 },
      context
    )

    if (!inventoryLevel) {
      return
    }

    return await this.inventoryLevelService_.delete(inventoryLevel.id, context)
  }

  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async updateInventoryLevels(
    updates: ({
      inventory_item_id: string
      location_id: string
    } & UpdateInventoryLevelInput)[],
    @MedusaContext() context: Context = {}
  ): Promise<InventoryLevelDTO[]> {
    const inventoryLevels = await this.ensureInventoryLevels(updates, context)

    const levelMap = inventoryLevels.reduce((acc, curr) => {
      const inventoryLevelMap = acc.get(curr.inventory_item_id) ?? new Map()
      inventoryLevelMap.set(curr.location_id, curr.id)
      acc.set(curr.inventory_item_id, inventoryLevelMap)
      return acc
    }, new Map())

    return await Promise.all(
      updates.map(async (update) => {
        const levelId = levelMap
          .get(update.inventory_item_id)
          .get(update.location_id)

        // TODO make this bulk
        return this.inventoryLevelService_.update(levelId, update, context)
      })
    )
  }

  /**
   * Updates an inventory level
   * @param inventoryItemId - the id of the inventory item associated with the level
   * @param locationId - the id of the location associated with the level
   * @param input - the input object
   * @param context
   * @return The updated inventory level
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async updateInventoryLevel(
    inventoryItemId: string,
    locationIdOrContext?: string,
    input?: UpdateInventoryLevelInput,
    @MedusaContext() context: Context = {}
  ): Promise<InventoryLevelDTO> {
    const updates: BulkUpdateInventoryLevelInput[] = [
      {
        inventory_item_id: inventoryItemId,
        location_id: locationIdOrContext as string,
        ...input,
      },
    ]

    const [result] = await this.updateInventoryLevels(updates, context)

    return result
  }

  /**
   * Updates a reservation item
   * @param reservationItemId
   * @param input - the input object
   * @param context
   * @param context
   * @return The updated inventory level
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async updateReservationItem(
    reservationItemId: string,
    input: UpdateReservationItemInput,
    @MedusaContext() context: Context = {}
  ): Promise<ReservationItemDTO> {
    return await this.reservationItemService_.update(
      reservationItemId,
      input,
      context
    )
  }

  /**
   * Deletes reservation items by line item
   * @param lineItemId - the id of the line item associated with the reservation item
   * @param context
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async deleteReservationItemsByLineItem(
    lineItemId: string | string[],
    @MedusaContext() context: Context = {}
  ): Promise<void> {
    return await this.reservationItemService_.deleteByLineItem(
      lineItemId,
      context
    )
  }

  /**
   * Deletes a reservation item
   * @param reservationItemId - the id of the reservation item to delete
   * @param context
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async deleteReservationItem(
    reservationItemId: string | string[],
    @MedusaContext() context: Context = {}
  ): Promise<void> {
    return await this.reservationItemService_.delete(reservationItemId, context)
  }

  /**
   * Adjusts the inventory level for a given inventory item and location.
   * @param inventoryItemId - the id of the inventory item
   * @param locationId - the id of the location
   * @param adjustment - the number to adjust the inventory by (can be positive or negative)
   * @param context
   * @return The updated inventory level
   * @throws when the inventory level is not found
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async adjustInventory(
    inventoryItemId: string,
    locationId: string,
    adjustment: number,
    @MedusaContext() context: Context = {}
  ): Promise<InventoryLevelDTO> {
    const [inventoryLevel] = await this.inventoryLevelService_.list(
      { inventory_item_id: inventoryItemId, location_id: locationId },
      { take: 1 },
      context
    )
    if (!inventoryLevel) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Inventory level for inventory item ${inventoryItemId} and location ${locationId} not found`
      )
    }

    const updatedInventoryLevel = await this.inventoryLevelService_.update(
      inventoryLevel.id,
      {
        stocked_quantity: inventoryLevel.stocked_quantity + adjustment,
      },
      context
    )

    return { ...updatedInventoryLevel }
  }

  /**
   * Retrieves the available quantity of a given inventory item in a given location.
   * @param inventoryItemId - the id of the inventory item
   * @param locationIds - the ids of the locations to check
   * @param context
   * @return The available quantity
   * @throws when the inventory item is not found
   */
  async retrieveAvailableQuantity(
    inventoryItemId: string,
    locationIds: string[],
    context: Context = {}
  ): Promise<number> {
    // Throws if item does not exist
    // TODO: context

    await this.inventoryItemService_.retrieve(
      inventoryItemId,
      {
        select: ["id"],
      },
      context
    )

    if (locationIds.length === 0) {
      return 0
    }

    const availableQuantity =
      await this.inventoryLevelService_.getAvailableQuantity(
        inventoryItemId,
        locationIds,
        context
      )

    return availableQuantity
  }

  /**
   * Retrieves the stocked quantity of a given inventory item in a given location.
   * @param inventoryItemId - the id of the inventory item
   * @param locationIds - the ids of the locations to check
   * @param context
   * @return The stocked quantity
   * @throws when the inventory item is not found
   */
  async retrieveStockedQuantity(
    inventoryItemId: string,
    locationIds: string[],
    context: Context = {}
  ): Promise<number> {
    // Throws if item does not exist
    // TODO: context
    await this.inventoryItemService_.retrieve(
      inventoryItemId,
      {
        select: ["id"],
      },
      context
    )

    if (locationIds.length === 0) {
      return 0
    }

    const stockedQuantity =
      await this.inventoryLevelService_.getStockedQuantity(
        inventoryItemId,
        locationIds,
        context
      )

    return stockedQuantity
  }

  /**
   * Retrieves the reserved quantity of a given inventory item in a given location.
   * @param inventoryItemId - the id of the inventory item
   * @param locationIds - the ids of the locations to check
   * @param context
   * @return The reserved quantity
   * @throws when the inventory item is not found
   */
  async retrieveReservedQuantity(
    inventoryItemId: string,
    locationIds: string[],
    context: Context = {}
  ): Promise<number> {
    // Throws if item does not exist
    await this.inventoryItemService_.retrieve(
      inventoryItemId,
      {
        select: ["id"],
      },
      context
    )

    if (locationIds.length === 0) {
      return 0
    }

    const reservedQuantity =
      await this.inventoryLevelService_.getReservedQuantity(
        inventoryItemId,
        locationIds,
        context
      )

    return reservedQuantity
  }

  /**
   * Confirms whether there is sufficient inventory for a given quantity of a given inventory item in a given location.
   * @param inventoryItemId - the id of the inventory item
   * @param locationIds - the ids of the locations to check
   * @param quantity - the quantity to check
   * @param context
   * @return Whether there is sufficient inventory
   */
  @InjectTransactionManager(shouldForceTransaction, "baseRepository_")
  async confirmInventory(
    inventoryItemId: string,
    locationIds: string[],
    quantity: number,
    @MedusaContext() context: Context = {}
  ): Promise<boolean> {
    const availableQuantity = await this.retrieveAvailableQuantity(
      inventoryItemId,
      locationIds,
      context
    )
    return availableQuantity >= quantity
  }
}
