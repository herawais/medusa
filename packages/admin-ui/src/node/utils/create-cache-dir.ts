import fse from "fs-extra"
import path from "node:path"
import { copyFilter } from "./copy-filter"
import { createEntry } from "./create-entry"
import { logger } from "./logger"

async function copyAdmin(dest: string) {
  const adminDir = path.resolve(__dirname, "..", "ui")
  const destDir = path.resolve(dest, "admin")

  try {
    await fse.copy(adminDir, destDir, {
      filter: copyFilter,
    })
  } catch (err) {
    logger.panic(
      `Could not copy the admin UI to ${destDir}. Please make sure you have write access to this folder.`
    )
  }
}

type CreateCacheDirArgs = {
  appDir: string
  plugins?: string[]
}

async function createCacheDir({ appDir, plugins }: CreateCacheDirArgs) {
  const cacheDir = path.resolve(appDir, ".cache")

  await fse.emptyDir(cacheDir)

  await copyAdmin(cacheDir)

  await createEntry({
    appDir,
    dest: cacheDir,
    plugins,
  })

  return {
    cacheDir,
  }
}

export { createCacheDir }