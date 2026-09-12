// Production ESL (Event Socket Library) client — a thin typed wrapper over
// `node:net` implementing only `auth`, `events plain …` and `api …` —
// the `esl` npm API is awkward for this. Justification for NOT
// taking the `esl` npm dependency: the wire protocol needed here (auth
// challenge/response, `event plain <names>`, `api <cmd>`, and parsing
// `text/event-plain` frames) is small, already implemented once for the
// container-test harness (`apps/worker/__tests__/helpers/freeswitch/
// esl-client.ts`), and the FreeSWITCH ESL framing is stable, documented wire
// format (mod_event_socket) — not something that benefits from a
// third-party abstraction. This file mirrors that test harness's proven
// framing logic (kept independent so a test-only file is never a runtime
// dependency) and adds reconnect-friendly lifecycle hooks the test harness
// doesn't need.
import { Socket } from "node:net"

export type EslHeaders = Readonly<Record<string, string>>
export type EslFrame = { readonly headers: EslHeaders; readonly body: string }

type PendingReply = {
  resolve: (frame: EslFrame) => void
  reject: (error: Error) => void
}

const HEADER_BODY_SEPARATOR = "\n\n"

const parseHeaders = (block: string): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const line of block.split("\n")) {
    const separatorIndex = line.indexOf(": ")
    if (separatorIndex === -1) {
      continue
    }
    const key = line.slice(0, separatorIndex)
    const rawValue = line.slice(separatorIndex + 2)
    try {
      headers[key] = decodeURIComponent(rawValue)
    } catch {
      headers[key] = rawValue
    }
  }
  return headers
}

class EslAuthError extends Error {
  constructor(reply: string | undefined) {
    super(`freeswitch-esl-auth-failed: ${reply ?? "<no reply>"}`)
    this.name = "EslAuthError"
  }
}

/**
 * One inbound ESL connection. `onEvent`/`onClose` are the integration points
 * the leader worker (`worker.ts`) uses to feed the batcher and trigger
 * reconnect-with-backoff; this class itself holds no reconnect policy.
 */
export class EslConnection {
  private readonly socket: Socket
  private buffer = ""
  private readonly pendingReplies: PendingReply[] = []
  private readonly eventListeners = new Set<(event: EslFrame) => void>()
  private readonly closeListeners = new Set<(error?: Error) => void>()
  private closed = false

  private constructor(socket: Socket) {
    this.socket = socket
    this.socket.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8")
      this.drainBuffer()
    })
    this.socket.on("close", () => {
      this.handleClose()
    })
  }

  static async connect(props: {
    host: string
    port: number
    password: string
  }): Promise<EslConnection> {
    return await new Promise((resolve, reject) => {
      const socket = new Socket()
      const connection = new EslConnection(socket)

      const onError = (error: Error) => reject(error)
      socket.once("error", onError)

      socket.connect(props.port, props.host, async () => {
        try {
          const authRequest = await connection.nextFrame()
          if (authRequest.headers["Content-Type"] !== "auth/request") {
            throw new EslAuthError(authRequest.headers["Content-Type"])
          }
          const authReply = await connection.sendCommand(
            `auth ${props.password}`,
          )
          if (!authReply.headers.Reply?.startsWith("+OK")) {
            throw new EslAuthError(authReply.headers.Reply)
          }
          socket.off("error", onError)
          socket.on("error", (error) => connection.handleClose(error))
          resolve(connection)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  }

  /** `events plain <names…>` (no server-side `filter`). */
  async subscribe(events: readonly string[]): Promise<void> {
    await this.sendCommand(`event plain ${events.join(" ")}`)
  }

  /** Sends `api <cmd>` and returns the trimmed reply body (synchronous ESL API contract). */
  async api(cmd: string): Promise<string> {
    const reply = await this.sendCommand(`api ${cmd}`)
    return reply.body.trim()
  }

  onEvent(listener: (event: EslFrame) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onClose(listener: (error?: Error) => void): () => void {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  close(): void {
    this.socket.end()
    this.socket.destroy()
  }

  private sendCommand(command: string): Promise<EslFrame> {
    return new Promise((resolve, reject) => {
      this.pendingReplies.push({ resolve, reject })
      this.socket.write(`${command}\n\n`)
    })
  }

  private nextFrame(): Promise<EslFrame> {
    return new Promise((resolve, reject) => {
      this.pendingReplies.push({ resolve, reject })
    })
  }

  private drainBuffer(): void {
    for (;;) {
      const separatorIndex = this.buffer.indexOf(HEADER_BODY_SEPARATOR)
      if (separatorIndex === -1) {
        return
      }
      const headerBlock = this.buffer.slice(0, separatorIndex)
      const headers = parseHeaders(headerBlock)
      const contentLength = Number(headers["Content-Length"] ?? "0")
      const bodyStart = separatorIndex + HEADER_BODY_SEPARATOR.length

      if (contentLength > 0 && this.buffer.length < bodyStart + contentLength) {
        return
      }

      const body =
        contentLength > 0
          ? this.buffer.slice(bodyStart, bodyStart + contentLength)
          : ""
      this.buffer = this.buffer.slice(bodyStart + contentLength)
      this.dispatchFrame({ headers, body })
    }
  }

  private dispatchFrame(frame: EslFrame): void {
    if (frame.headers["Content-Type"] === "text/event-plain") {
      // The event's own headers (Event-Name, Unique-ID, variable_*) are
      // encoded in the BODY as another header block for this content type.
      const eventHeaders = parseHeaders(frame.body)
      const emitted: EslFrame = { headers: eventHeaders, body: frame.body }
      for (const listener of this.eventListeners) {
        listener(emitted)
      }
      return
    }

    // command/reply and api/response both resolve the oldest pending
    // command — ESL is a strict request/response protocol per connection.
    const pending = this.pendingReplies.shift()
    pending?.resolve(frame)
  }

  private handleClose(error?: Error): void {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const pending of this.pendingReplies) {
      pending.reject(error ?? new Error("freeswitch-esl-connection-closed"))
    }
    this.pendingReplies.length = 0
    for (const listener of this.closeListeners) {
      listener(error)
    }
  }
}
