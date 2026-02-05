import fs from "fs"
import path from "path"
import { promisify } from "util"
import { uploader } from "../uploader"
import { NDJSON_EXT } from "./ndjson-constants"

const readdir = promisify(fs.readdir)
const mkdir = promisify(fs.mkdir)
const rename = promisify(fs.rename)

export interface NdjsonS3UploaderConfig {
  rootPath: string
  s3Prefix: string
  concurrency: number
  onFileUploaded?: (info: {
    localPath: string
    s3Key: string
    dtPart: string
    hourPart: string
  }) => Promise<void> | void
}

export class NdjsonS3Uploader {
  private readonly config: NdjsonS3UploaderConfig
  private isProcessing = false

  constructor(config: NdjsonS3UploaderConfig) {
    this.config = config
  }

  async uploadReadyFiles(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      const readyFiles = await this.findReadyFiles()

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

  private async findReadyFiles(): Promise<string[]> {
    const files: string[] = []

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
            `[NdjsonS3Uploader] Error scanning directory ${dir}`,
            error,
          )
        }
      }
    }

    await scanDir(this.config.rootPath)
    return files
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
        console.error(`[NdjsonS3Uploader] Invalid path structure: ${filePath}`)
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

      if (this.config.onFileUploaded) {
        await this.config.onFileUploaded({
          localPath: uploadedPath,
          s3Key: committedKey,
          dtPart,
          hourPart,
        })
      }
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
      console.error(`[NdjsonS3Uploader] Failed to upload ${filePath}`, error)
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
