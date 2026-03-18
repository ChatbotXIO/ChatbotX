import crypto from "crypto"
import { once } from "events"
import fs from "fs"
import path from "path"
import { NDJSON_EXT } from "./ndjson-constants"

const fsp = fs.promises

export interface NdjsonSpoolerConfig {
  /**
   * A single .tmp file should only accept logs for this window.
   * After this window, next write will open a NEW .tmp (without renaming old one).
   */
  acceptWindowSeconds: number // e.g. 10

  /**
   * Function to build tmp filename
   */
  buildFilename?: (params: {
    eventType: string
    instanceId: string
    timestamp: number
    seq: number
  }) => string
  eventType: string

  /**
   * Optional overrides
   */
  instanceId?: string
  rootPath: string
}

function safeNumber(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n)
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export class NdjsonSpooler {
  private readonly config: NdjsonSpoolerConfig
  private readonly instanceId: string

  private currentFile: string | null = null
  private currentDirPath: string | null = null
  private currentFileStartTimeMs: number | null = null
  private writeStream: fs.WriteStream | null = null

  private writeChain: Promise<void> = Promise.resolve()
  private shuttingDown = false
  private sequenceCounter = 0

  constructor(config: NdjsonSpoolerConfig) {
    this.config = {
      ...config,
      acceptWindowSeconds: safeNumber(config.acceptWindowSeconds, 10),
    }

    const baseId =
      config.instanceId ||
      process.env.NDJSON_INSTANCE_ID ||
      process.env.HOSTNAME ||
      "instance"

    const suffix = crypto.randomBytes(4).toString("hex")
    this.instanceId = `${baseId}-${process.pid}-${suffix}`
  }

  initialize(): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Write an event into the current .tmp file.
   *
   * Rules requested:
   * - Request path does NOT rename to .ready.
   * - A single .tmp file accepts logs for acceptWindowSeconds only.
   *   After that, we open a new .tmp and let the timer rename the old one later.
   */
  writeEvent(event: Record<string, unknown>): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      if (this.shuttingDown) {
        throw new Error("Spooler is shutting down")
      }

      const now = new Date()
      const nowMs = now.getTime()
      const bucketStartMs = this.getBucketStartMs(nowMs)

      const dirPath = this.getDirectoryPath(now)
      if (this.currentDirPath !== dirPath) {
        await fsp.mkdir(dirPath, { recursive: true })
        // Switch directory: stop using current file and open a new tmp.
        await this.rollToNewFile(dirPath, bucketStartMs)
      }

      if (this.writeStream && this.currentFile && this.currentFileStartTimeMs) {
        // Enforce accept window by bucket (do NOT rename old file here)
        if (this.currentFileStartTimeMs !== bucketStartMs) {
          await this.rollToNewFile(dirPath, bucketStartMs)
        }
      } else {
        await this.startNewFile(dirPath, bucketStartMs)
      }

      const line = `${JSON.stringify(event)}\n`
      await this.writeLine(line)
    })

    return this.writeChain
  }

  async tryWriteEvent(
    event: Record<string, unknown>,
  ): Promise<{ ok: true } | { ok: false; error: unknown }> {
    try {
      await this.writeEvent(event)
      return { ok: true }
    } catch (error) {
      return { ok: false, error }
    }
  }

  /**
   * Flush:
   * - Close current stream
   * - Immediately rename current and all pending .tmp -> .ready
   */
  async flush(): Promise<void> {
    await this.writeChain

    if (this.writeStream) {
      const stream = this.writeStream
      await new Promise<void>((resolve) => stream.end(resolve))
      this.writeStream = null
    }

    this.currentFile = null
    this.currentFileStartTimeMs = null
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true

    await this.flush()
  }

  // =========================
  // Internal helpers
  // =========================

  private async writeLine(line: string): Promise<void> {
    const stream = this.writeStream
    if (!stream) {
      throw new Error("Write stream not initialized")
    }

    const ok = stream.write(line, "utf8")
    if (ok) {
      return
    }

    await once(stream, "drain")
  }

  private getDirectoryPath(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    const h = String(date.getHours()).padStart(2, "0")

    return path.join(
      this.config.rootPath,
      this.config.eventType,
      `dt=${y}-${m}-${d}`,
      `hour=${h}`,
    )
  }

  private getBucketStartMs(nowMs: number): number {
    const windowSeconds = Math.max(1, this.config.acceptWindowSeconds)
    const windowMs = windowSeconds * 1000
    return Math.floor(nowMs / windowMs) * windowMs
  }

  private async startNewFile(dirPath: string, nowMs: number): Promise<void> {
    await fsp.mkdir(dirPath, { recursive: true })

    // Close old stream if still open
    if (this.writeStream) {
      const stream = this.writeStream
      await new Promise<void>((resolve) => stream.end(resolve))
      this.writeStream = null
    }

    this.currentDirPath = dirPath
    const seq = this.sequenceCounter++
    const filename = this.config.buildFilename
      ? this.config.buildFilename({
          eventType: this.config.eventType,
          instanceId: this.instanceId,
          timestamp: nowMs,
          seq,
        })
      : `${this.config.eventType}_${this.instanceId}_${nowMs}_${seq}${NDJSON_EXT.TMP}`
    this.currentFile = path.join(dirPath, filename)
    this.currentFileStartTimeMs = nowMs

    this.writeStream = fs.createWriteStream(this.currentFile, {
      flags: "a",
      encoding: "utf8",
    })
  }

  /**
   * Stop writing to current file (do NOT rename here),
   * push it into pending list for timer to cut later,
   * and start a fresh tmp file.
   */
  private async rollToNewFile(
    nextDirPath: string,
    nowMs: number,
  ): Promise<void> {
    // Close stream & start new file
    await this.startNewFile(nextDirPath, nowMs)
  }
}
