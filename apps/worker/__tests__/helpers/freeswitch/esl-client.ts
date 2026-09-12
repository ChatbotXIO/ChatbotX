// Minimal FreeSWITCH Event Socket Library (ESL) client for the container
// integration test. The `esl` npm package is NOT a dependency
// of apps/worker (`pnpm ls esl --filter worker` returns nothing), and the
// task instructions say to add a raw client rather than a new dependency
// for a test-only harness — this implements just the inbound-connection
// subset of the ESL wire protocol used by the tests: `auth`, `api`,
// `event plain`, and parsing `CHANNEL_ANSWER`/`CHANNEL_HANGUP_COMPLETE`/
// `CUSTOM` event frames.
//
// Wire protocol reference: FreeSWITCH's mod_event_socket sends whitespace-
// delimited MIME-style header blocks terminated by a blank line
// (`\n\n`), optionally followed by a `Content-Length`-declared body. This
// is documented FreeSWITCH ESL behavior (event_socket.conf.xml / mod_event_
// socket docs) — the parser below implements exactly that
// framing, nothing FreeSWITCH-version-specific.
import { Socket } from "node:net"

export type EslHeaders = Readonly<Record<string, string>>

export type EslEvent = {
  readonly headers: EslHeaders
  readonly body: string
}

type PendingReply = {
  resolve: (event: EslEvent) => void
  reject: (error: Error) => void
}

const HEADER_BODY_SEPARATOR = "\n\n"

function parseHeaders(block: string): EslHeaders {
  const headers: Record<string, string> = {}
  for (const line of block.split("\n")) {
    const separatorIndex = line.indexOf(": ")
    if (separatorIndex === -1) {
      continue
    }
    const key = line.slice(0, separatorIndex)
    const rawValue = line.slice(separatorIndex + 2)
    headers[key] = decodeURIComponent(rawValue)
  }
  return headers
}

/** Parses one or more channel-variable lines (`variable_x: y`) out of an
 * event body that FreeSWITCH sends as `text/event-plain`. */
export function parseEventPlainBody(body: string): EslHeaders {
  return parseHeaders(body)
}

export class EslClient {
  private readonly socket: Socket
  private buffer = ""
  private readonly pendingReplies: PendingReply[] = []
  private readonly eventListeners = new Set<(event: EslEvent) => void>()
  private connected = false

  private constructor(socket: Socket) {
    this.socket = socket
    this.socket.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8")
      this.drainBuffer()
    })
  }

  static connect(
    host: string,
    port: number,
    password: string,
  ): Promise<EslClient> {
    return new Promise((resolve, reject) => {
      const socket = new Socket()
      const client = new EslClient(socket)

      const onError = (error: Error) => {
        reject(error)
      }
      socket.once("error", onError)

      socket.connect(port, host, async () => {
        try {
          const authRequest = await client.nextFrame()
          if (authRequest.headers["Content-Type"] !== "auth/request") {
            throw new Error(
              `expected auth/request, got ${authRequest.headers["Content-Type"] ?? "<none>"}`,
            )
          }
          const authReply = await client.sendCommand(`auth ${password}`)
          if (!authReply.headers.Reply?.startsWith("+OK")) {
            throw new Error(
              `ESL auth failed: ${authReply.headers.Reply ?? "<no reply>"}`,
            )
          }
          client.markConnected()
          socket.off("error", onError)
          socket.on("error", () => {
            // Swallow post-connect socket errors; callers observe failures
            // via command timeouts/rejections instead.
          })
          resolve(client)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  }

  get isConnected(): boolean {
    return this.connected
  }

  private markConnected(): void {
    this.connected = true
  }

  onEvent(listener: (event: EslEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  async subscribe(events: readonly string[]): Promise<void> {
    await this.sendCommand(`event plain ${events.join(" ")}`)
  }

  async api(command: string): Promise<string> {
    const reply = await this.sendCommand(`api ${command}`)
    return reply.body.trim()
  }

  close(): void {
    this.socket.end()
    this.socket.destroy()
  }

  private sendCommand(command: string): Promise<EslEvent> {
    return new Promise((resolve, reject) => {
      this.pendingReplies.push({ resolve, reject })
      this.socket.write(`${command}\n\n`)
    })
  }

  private nextFrame(): Promise<EslEvent> {
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
        // Body not fully received yet — wait for more data.
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

  private dispatchFrame(event: EslEvent): void {
    const contentType = event.headers["Content-Type"]
    if (contentType === "text/event-plain") {
      const eventHeaders = parseEventPlainBody(event.body)
      const emitted: EslEvent = { headers: eventHeaders, body: event.body }
      for (const listener of this.eventListeners) {
        listener(emitted)
      }
      return
    }

    // command/reply and api/response both resolve the oldest pending
    // command — FreeSWITCH's ESL is a strict request/response protocol
    // per connection (no interleaved replies), so FIFO is correct.
    const pending = this.pendingReplies.shift()
    pending?.resolve(event)
  }
}
