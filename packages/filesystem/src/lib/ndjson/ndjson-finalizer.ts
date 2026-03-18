import fs from "fs"
import path from "path"
import { promisify } from "util"
import { NDJSON_EXT } from "./ndjson-constants"

const readdir = promisify(fs.readdir)
const rename = promisify(fs.rename)
const stat = promisify(fs.stat)

export interface NdjsonFinalizerConfig {
  parseFilename: (filename: string) => { timestamp: number } | null
  rootPath: string
}

export class NdjsonFinalizer {
  private readonly config: NdjsonFinalizerConfig
  private isProcessing = false

  constructor(config: NdjsonFinalizerConfig) {
    this.config = config
  }

  async finalizeTmpFiles(maxAgeMs = 15_000): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      const files = await this.listTmpFiles(this.config.rootPath)

      for (const filePath of files) {
        await this.finalizeFile(filePath, maxAgeMs)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async listTmpFiles(rootDir: string): Promise<string[]> {
    const out: string[] = []
    await this.listTmpFilesInDir(rootDir, out)

    return out
  }

  private async listTmpFilesInDir(dir: string, out: string[]): Promise<void> {
    const entries = await this.readDir(dir)
    if (!entries) {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await this.listTmpFilesInDir(fullPath, out)
        continue
      }

      if (!this.isTmp(entry)) {
        continue
      }

      out.push(fullPath)
    }
  }

  private async readDir(dir: string): Promise<fs.Dirent[] | null> {
    try {
      return await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(
          `[NdjsonFinalizer] Error scanning directory ${dir}`,
          error,
        )
      }
      return null
    }
  }

  private isTmp(entry: fs.Dirent): boolean {
    return entry.isFile() && entry.name.endsWith(NDJSON_EXT.TMP)
  }

  private async finalizeFile(
    filePath: string,
    maxAgeMs: number,
  ): Promise<void> {
    const createdAt = this.parseTimestamp(filePath)
    if (!createdAt) {
      return
    }

    const ageMs = Date.now() - createdAt
    if (ageMs < maxAgeMs) {
      return
    }

    const s1 = await this.statSafe(filePath)
    if (!s1 || s1.size <= 0) {
      return
    }

    await this.delay(150)

    const s2 = await this.statSafe(filePath)
    if (!(s2 && this.sameStat(s1, s2))) {
      return
    }

    const readyPath = this.readyPath(filePath)
    await this.renameSafe(filePath, readyPath)
  }

  private async statSafe(filePath: string): Promise<fs.Stats | null> {
    try {
      return await stat(filePath)
    } catch {
      return null
    }
  }

  private parseTimestamp(filePath: string): number | null {
    const filename = path.basename(filePath)
    const parsed = this.config.parseFilename(filename)
    return parsed?.timestamp ?? null
  }

  private sameStat(s1: fs.Stats, s2: fs.Stats): boolean {
    return s2.size === s1.size && s2.mtimeMs === s1.mtimeMs
  }

  private readyPath(tmpPath: string): string {
    const timestamp = Date.now()
    const seq = Math.floor(Math.random() * 1_000_000)
    return path.join(
      path.dirname(tmpPath),
      `${path.basename(tmpPath, NDJSON_EXT.TMP)}_${timestamp}_${seq}${NDJSON_EXT.READY}`,
    )
  }

  private async renameSafe(from: string, to: string): Promise<void> {
    try {
      console.log(`[NdjsonFinalizer] Renaming ${from} to ${to}`)

      await rename(from, to)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT" || code === "EEXIST") {
        return
      }
      console.error(`[NdjsonFinalizer] Failed to finalize tmp ${from}`, error)
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms))
  }
}
