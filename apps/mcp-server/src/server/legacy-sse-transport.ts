import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import {
  type JSONRPCMessage,
  JSONRPCMessageSchema,
  type MessageExtraInfo,
} from "@modelcontextprotocol/sdk/types.js"

export class LegacySseTransport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: <T extends JSONRPCMessage>(
    message: T,
    extra?: MessageExtraInfo,
  ) => void

  private readonly endpointPath: string
  private readonly res: ServerResponse
  private readonly sessionIdValue: string
  private sseResponse?: ServerResponse

  constructor(endpointPath: string, res: ServerResponse) {
    this.endpointPath = endpointPath
    this.res = res
    this.sessionIdValue = randomUUID()
  }

  start(): Promise<void> {
    if (this.sseResponse) {
      throw new Error("LegacySseTransport already started")
    }

    this.res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    })

    const endpointUrl = new URL(this.endpointPath, "http://localhost")
    endpointUrl.searchParams.set("sessionId", this.sessionIdValue)
    const endpointWithSession =
      endpointUrl.pathname + endpointUrl.search + endpointUrl.hash

    this.res.write(`event: endpoint\ndata: ${endpointWithSession}\n\n`)
    this.sseResponse = this.res

    this.res.on("close", () => {
      this.sseResponse = undefined
      this.onclose?.()
    })

    return Promise.resolve()
  }

  handlePostMessage(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown,
  ): Promise<void> {
    if (!this.sseResponse) {
      res.writeHead(500).end("SSE connection not established")
      return Promise.resolve()
    }

    try {
      const message = JSONRPCMessageSchema.parse(parsedBody)
      const fullUrl = new URL(req.url ?? "", "http://localhost")
      this.onmessage?.(message, {
        requestInfo: {
          headers: req.headers,
          url: fullUrl,
        },
      })
      res.writeHead(202).end("Accepted")
    } catch {
      res.writeHead(400).end("Invalid JSON-RPC message")
    }

    return Promise.resolve()
  }

  close(): Promise<void> {
    this.sseResponse?.end()
    this.sseResponse = undefined
    this.onclose?.()
    return Promise.resolve()
  }

  send(message: JSONRPCMessage): Promise<void> {
    if (!this.sseResponse) {
      throw new Error("Not connected")
    }
    this.sseResponse.write(
      `event: message\ndata: ${JSON.stringify(message)}\n\n`,
    )
    return Promise.resolve()
  }

  get sessionId(): string {
    return this.sessionIdValue
  }
}
