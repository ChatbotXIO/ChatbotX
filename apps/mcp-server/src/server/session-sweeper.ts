import { getChildLogger } from "@chatbotx.io/logger"
import { env } from "../env"

const logger = getChildLogger("mcp-server")

const MAX_SWEEP_INTERVAL_MS = 60_000

/**
 * Evicts sessions that have been idle longer than `CHATBOTX_MCP_SESSION_IDLE_TTL_MS`.
 * A client that disconnects without closing its transport would otherwise leave
 * its session (server + transport + credentials) in the map forever.
 */
export class IdleSessionSweeper {
  private readonly lastActivityMs = new Map<string, number>()
  private timer: NodeJS.Timeout | undefined
  private readonly evict: (sessionId: string) => Promise<void> | void

  constructor(evict: (sessionId: string) => Promise<void> | void) {
    this.evict = evict
  }

  /** Records activity for a session and starts the sweep timer on first use. */
  touch(sessionId: string): void {
    this.lastActivityMs.set(sessionId, Date.now())
    this.ensureTimer()
  }

  forget(sessionId: string): void {
    this.lastActivityMs.delete(sessionId)
  }

  /** Evicts every session idle for at least the TTL; returns how many. */
  async sweep(nowMs = Date.now()): Promise<number> {
    const ttlMs = env.CHATBOTX_MCP_SESSION_IDLE_TTL_MS
    const idle = [...this.lastActivityMs]
      .filter(([, lastMs]) => nowMs - lastMs >= ttlMs)
      .map(([sessionId]) => sessionId)
    for (const sessionId of idle) {
      this.lastActivityMs.delete(sessionId)
      try {
        await this.evict(sessionId)
      } catch (err) {
        logger.error({ err, sessionId }, "Failed to close idle MCP session")
      }
    }
    return idle.length
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  private ensureTimer(): void {
    if (this.timer) {
      return
    }
    const intervalMs = Math.min(
      env.CHATBOTX_MCP_SESSION_IDLE_TTL_MS,
      MAX_SWEEP_INTERVAL_MS,
    )
    this.timer = setInterval(() => {
      this.sweep().catch((err: unknown) => {
        logger.error({ err }, "MCP idle session sweep failed")
      })
    }, intervalMs)
    // Never keep the process alive just to sweep.
    this.timer.unref()
  }
}
