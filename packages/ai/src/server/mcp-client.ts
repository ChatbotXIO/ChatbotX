import {
  type AIMcpServerAuth,
  aiMcpServerAuthTypes,
} from "@chatbotx.io/database/partials"
import ky, { type Options } from "ky"
import { normalizeError } from "universal-error-normalizer"
import { aiTimeouts, helpTexts, mcpConstants } from "../constants"
import { logger } from "../logger"
import {
  type MCPTool,
  mcpContentArraySchema,
  mcpJsonRpcErrorResponseSchema,
  mcpJsonRpcSuccessSchema,
} from "../schemas/mcp"
import type { JsonObject, JsonValue } from "../utils"

const mcpKy = ky.create({
  throwHttpErrors: false,
  timeout: aiTimeouts.httpDefault,
  retry: { limit: 0 },
})

export interface McpClientOptions {
  auth: AIMcpServerAuth
  name?: string
  url: string
}

export const normalizeMcpContent = (content: JsonValue): JsonValue => {
  const parsed = mcpContentArraySchema.safeParse(content)
  if (!parsed.success || parsed.data.length === 0) {
    return content
  }

  const firstItem = parsed.data[0]
  if (
    typeof firstItem === "object" &&
    firstItem !== null &&
    "type" in firstItem &&
    firstItem.type === "text" &&
    "text" in firstItem &&
    typeof firstItem.text === "string"
  ) {
    return firstItem.text
  }

  return content
}

export class McpClient {
  private readonly url: string
  private readonly auth: AIMcpServerAuth
  private readonly name: string
  private initialized = false
  private isLegacy = false
  private requestIdCounter = 0

  constructor(options: McpClientOptions) {
    this.url = options.url
    this.auth = options.auth
    this.name = options.name ?? "MCP Server"
  }

  private getNextRequestId(): number {
    this.requestIdCounter = (this.requestIdCounter + 1) % 1_000_000
    return Date.now() + this.requestIdCounter
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    }

    switch (this.auth.type) {
      case aiMcpServerAuthTypes.enum.header:
        for (const h of this.auth.headers) {
          headers[h.header] = h.value
        }
        break
      case aiMcpServerAuthTypes.enum.token:
        headers.Authorization = `Bearer ${this.auth.token}`
        break
      default:
        break
    }

    return headers
  }

  private async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeout?: number,
    isNotification = false,
  ): Promise<T | null> {
    const requestId = isNotification ? undefined : this.getNextRequestId()
    const options: Options = {
      headers: this.getHeaders(),
      json: {
        jsonrpc: helpTexts.jsonRpcVersion,
        ...(requestId === undefined ? {} : { id: requestId }),
        method,
        params,
      },
      timeout: timeout ?? aiTimeouts.httpDefault,
    }

    try {
      const responseText = await mcpKy.post(this.url, options).text()
      if (isNotification) {
        return null
      }
      const trimmed = responseText.trim()
      let parsed: unknown

      if (trimmed.includes("data:")) {
        const dataLines = trimmed
          .split("\n")
          .filter((line: string) => line.startsWith("data:"))
          .map((line: string) => line.slice("data:".length).trim())
        const lastData = dataLines.at(-1) ?? "{}"
        parsed = JSON.parse(lastData)
      } else {
        parsed = JSON.parse(trimmed)
      }

      // Check for JSON-RPC error
      const errorParsed = mcpJsonRpcErrorResponseSchema.safeParse(parsed)
      if (errorParsed.success) {
        throw new Error(errorParsed.data.error.message)
      }

      const successParsed = mcpJsonRpcSuccessSchema.safeParse(parsed)
      if (!successParsed.success) {
        throw new Error("Invalid JSON-RPC 2.0 response")
      }

      return successParsed.data.result as T
    } catch (error) {
      const normalized = normalizeError(error)
      logger.error(
        { error: normalized, method, url: this.url },
        `[McpClient][${this.name}] Request failed`,
      )
      throw error
    }
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  async initialize() {
    if (this.initialized) {
      return
    }

    try {
      await this.request(
        mcpConstants.jsonRpcMethods.initialize,
        {
          protocolVersion: mcpConstants.protocolVersion,
          capabilities: {},
          clientInfo: mcpConstants.clientInfo,
        },
        aiTimeouts.mcpList,
      )

      this.request(
        mcpConstants.jsonRpcMethods.notificationsInitialized,
        {},
        undefined,
        true,
      ).catch((err) => {
        logger.warn(
          { error: normalizeError(err) },
          `[McpClient][${this.name}] Failed to send initialized notification`,
        )
      })

      this.initialized = true
      this.isLegacy = false
    } catch (error) {
      const normalized = normalizeError(error)
      const errorMessage = (normalized.message || "").toLowerCase()
      // JSON-RPC -32601 is typically "Method not found"; avoid broad "not found"/"404"
      // so misconfigured URLs or unrelated errors are not treated as legacy MCP.
      if (errorMessage.includes("method not found")) {
        logger.info(
          { url: this.url, name: this.name },
          `[McpClient][${this.name}] Server does not support initialize, switching to legacy mode`,
        )
        this.isLegacy = true
        this.initialized = true
      } else {
        throw error
      }
    }
  }

  async listTools(): Promise<MCPTool[]> {
    await this.ensureInitialized()

    const result = await this.request<{ tools: MCPTool[] }>(
      mcpConstants.jsonRpcMethods.toolsList,
      {},
      aiTimeouts.mcpList,
    )
    return result?.tools ?? []
  }

  async callTool(toolName: string, args: JsonObject) {
    await this.ensureInitialized()

    const result = await this.request<JsonObject>(
      mcpConstants.jsonRpcMethods.toolsCall,
      {
        name: toolName,
        arguments: args,
      },
      aiTimeouts.mcpCall,
    )

    if (!result) {
      throw new Error(
        `[McpClient][${this.name}] No result returned from tool call: ${toolName}`,
      )
    }

    return {
      isError: false,
      content: result.content as JsonValue,
    }
  }

  getLegacyStatus() {
    return this.isLegacy
  }

  async close() {
    await Promise.resolve()
  }
}
