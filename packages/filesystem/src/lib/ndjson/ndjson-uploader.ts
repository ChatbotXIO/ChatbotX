import fs from "fs"
import path from "path"
import { promisify } from "util"
import { uploader } from "../uploader"
import { NDJSON_EXT } from "./ndjson-constants"

const readdir = promisify(fs.readdir)
const mkdir = promisify(fs.mkdir)
const rename = promisify(fs.rename)
const stat = promisify(fs.stat)
const rm = promisify(fs.rm)

export interface NdjsonUploaderConfig {
  rootPath: string
  s3Prefix: string
  concurrency: number
}

export class NdjsonUploader {
  private readonly config: NdjsonUploaderConfig
  private isProcessing = false
  private isFinalizingTmp = false
  private isCleaningEmptyDirs = false

  constructor(config: NdjsonUploaderConfig) {
    this.config = config
  }

  async uploadReadyFiles(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      const readyFiles = await this.findReadyNdjsonFiles()

      if (readyFiles.length === 0) {
        return
      }

      const batches = this.chunkArray(readyFiles, this.config.concurrency)

      for (const batch of batches) {
        await Promise.all(batch.map((file) => this.uploadFile(file)))
      }
    } finally {
      this.isProcessing = false
    }
  }

  async cleanupEmptyDirsOlderThan(
    maxAgeMs = 2 * 60 * 60 * 1000,
  ): Promise<void> {
    if (this.isCleaningEmptyDirs) {
      return
    }

    this.isCleaningEmptyDirs = true

    try {
      const baseDir = await this.getScanBaseDir()
      await this.cleanupEmptyDirs(baseDir, maxAgeMs, baseDir)
    } finally {
      this.isCleaningEmptyDirs = false
    }
  }

  async finalizeStaleTmpFiles(maxAgeMs = 15_000): Promise<void> {
    if (this.isFinalizingTmp) {
      return
    }

    this.isFinalizingTmp = true

    try {
      const baseDir = await this.getScanBaseDir()
      await this.finalizeTmpFiles(baseDir, maxAgeMs)
    } finally {
      this.isFinalizingTmp = false
    }
  }

  private async findReadyNdjsonFiles(): Promise<string[]> {
    const files: string[] = []

    const baseDir = await this.getScanBaseDir()

    const scanDir = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)

          if (entry.isDirectory()) {
            await scanDir(fullPath)
          } else if (entry.name.endsWith(NDJSON_EXT.READY)) {
            files.push(fullPath)
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(
            `[NdjsonUploader] Error scanning directory ${dir}`,
            error,
          )
        }
      }
    }

    await scanDir(baseDir)
    return files
  }

  private async finalizeTmpFiles(dir: string, maxAgeMs: number): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[NdjsonUploader] Error scanning directory ${dir}`, error)
      }
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await this.finalizeTmpFiles(fullPath, maxAgeMs)
        continue
      }

      if (!(entry.isFile() && entry.name.endsWith(NDJSON_EXT.TMP))) {
        continue
      }

      let s1: fs.Stats
      try {
        s1 = await stat(fullPath)
      } catch {
        continue
      }

      if (s1.size <= 0) {
        continue
      }

      const ageMs = Date.now() - s1.mtimeMs
      if (ageMs < maxAgeMs) {
        continue
      }

      await new Promise((r) => setTimeout(r, 150))

      let s2: fs.Stats
      try {
        s2 = await stat(fullPath)
      } catch {
        continue
      }

      if (s2.size !== s1.size || s2.mtimeMs !== s1.mtimeMs) {
        continue
      }

      const timestamp = Date.now()
      const seq = Math.floor(Math.random() * 1_000_000)
      const readyPath = path.join(
        path.dirname(fullPath),
        `${path.basename(fullPath, NDJSON_EXT.TMP)}_${timestamp}_${seq}${NDJSON_EXT.READY}`,
      )

      try {
        await rename(fullPath, readyPath)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ENOENT" || code === "EEXIST") {
          continue
        }
        console.error(
          `[NdjsonUploader] Failed to finalize tmp ${fullPath}`,
          error,
        )
      }
    }
  }

  private async cleanupEmptyDirs(
    dir: string,
    maxAgeMs: number,
    baseDir: string,
  ): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[NdjsonUploader] Error scanning directory ${dir}`, error)
      }
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const fullPath = path.join(dir, entry.name)
      await this.cleanupEmptyDirs(fullPath, maxAgeMs, baseDir)
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
      await rm(dir)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT" || code === "ENOTEMPTY") {
        return
      }
      console.error(`[NdjsonUploader] Failed to remove empty dir ${dir}`, error)
    }
  }

  private async getScanBaseDir(): Promise<string> {
    const preferred = path.join(this.config.rootPath, this.config.s3Prefix)
    try {
      const st = await promisify(fs.stat)(preferred)
      if (st.isDirectory()) {
        return preferred
      }
    } catch {
      // ignore
    }

    return this.config.rootPath
  }

  private async uploadFile(filePath: string): Promise<void> {
    try {
      const uploadingPath = filePath.replace(
        NDJSON_EXT.READY,
        NDJSON_EXT.UPLOADING,
      )

      try {
        await rename(filePath, uploadingPath)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ENOENT" || code === "EEXIST") {
          return
        }
        throw error
      }

      const relativePath = path.relative(this.config.rootPath, filePath)
      const parts = relativePath.split(path.sep)

      let dtPart: string | undefined
      let hourPart: string | undefined
      for (const part of parts) {
        if (!dtPart && part.startsWith("dt=")) {
          dtPart = part
          continue
        }
        if (!hourPart && part.startsWith("hour=")) {
          hourPart = part
          continue
        }
        if (dtPart && hourPart) {
          break
        }
      }
      const fileName = path.basename(filePath, NDJSON_EXT.READY)

      if (!(dtPart && hourPart)) {
        console.error(`[NdjsonUploader] Invalid path structure: ${filePath}`)
        return
      }

      const stagingKey = `${this.config.s3Prefix}/staging/${dtPart}/${hourPart}/${fileName}${NDJSON_EXT.TMP}`
      const committedKey = `${this.config.s3Prefix}/committed/${dtPart}/${hourPart}/${fileName}.ndjson`

      const body = fs.createReadStream(uploadingPath)
      await uploader.putObject(stagingKey, body)

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await uploader.copyObject(stagingKey, committedKey)
          break
        } catch (error) {
          if (attempt === 2) {
            throw error
          }
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
        }
      }

      await uploader.deleteObject(stagingKey)

      const uploadedDir = path.join(path.dirname(uploadingPath), "uploaded")
      await mkdir(uploadedDir, { recursive: true })
      const uploadedPath = path.join(uploadedDir, path.basename(uploadingPath))
      await rename(uploadingPath, uploadedPath)
    } catch (error) {
      try {
        if (filePath.endsWith(NDJSON_EXT.READY)) {
          const uploadingPath = filePath.replace(
            NDJSON_EXT.READY,
            NDJSON_EXT.UPLOADING,
          )
          await rename(uploadingPath, filePath)
        }
      } catch {
        // ignore
      }
      console.error(`[NdjsonUploader] Failed to upload ${filePath}`, error)
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
