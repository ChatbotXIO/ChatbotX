import fs from "fs"
import path from "path"
import { promisify } from "util"

const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)
const rm = promisify(fs.rm)

export interface NdjsonCleanerConfig {
  rootPath: string
}

export class NdjsonCleaner {
  private readonly config: NdjsonCleanerConfig
  private isProcessing = false

  constructor(config: NdjsonCleanerConfig) {
    this.config = config
  }

  async cleanupEmptyDirs(maxAgeMs = 2 * 60 * 60 * 1000): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      await this.scanAndCleanup(
        this.config.rootPath,
        maxAgeMs,
        this.config.rootPath,
      )
    } finally {
      this.isProcessing = false
    }
  }

  private async scanAndCleanup(
    dir: string,
    maxAgeMs: number,
    baseDir: string,
  ): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[NdjsonCleaner] Error scanning directory ${dir}`, error)
      }

      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const fullPath = path.join(dir, entry.name)
      await this.scanAndCleanup(fullPath, maxAgeMs, baseDir)
    }

    if (dir === baseDir) {
      return
    }

    let after: fs.Dirent[]
    try {
      after = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    if (after.length !== 0) {
      return
    }

    let st: fs.Stats
    try {
      st = await stat(dir)
    } catch {
      return
    }

    const ageMs = Date.now() - st.mtimeMs
    if (ageMs < maxAgeMs) {
      return
    }

    try {
      console.log({ deleteDir: dir })
      await rm(dir)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT" || code === "ENOTEMPTY") {
        return
      }
      console.error(`[NdjsonCleaner] Failed to remove empty dir ${dir}`, error)
    }
  }
}
