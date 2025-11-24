import { logger } from "../../../lib/logger"
import { AUTH_TYPES, JSON_TYPE, TEXT } from "./constants"

type MCPHeader = { header: string; value: string }
type MCPAuth =
  | { type: "TOKEN"; token: string }
  | { type: "HEADERS"; headers: MCPHeader[] }
  | { type: "NONE" }

type MCPSuccess = { content: unknown; success: true }
type MCPFailure = { error: string; success: false }
type MCPResult = MCPSuccess | MCPFailure

export async function callMCPTool(
  mcpServerUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  auth?: MCPAuth,
): Promise<MCPResult> {
  try {
    const requestId = Date.now() + Math.floor(Math.random() * 1000)
    const requestBody = {
      jsonrpc: TEXT.jsonRpcVersion,
      id: requestId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }

    const headers: Record<string, string> = {
      "Content-Type": TEXT.contentType,
    }

    if (auth !== undefined) {
      switch (auth.type) {
        case AUTH_TYPES.TOKEN:
          headers.Authorization = `${TEXT.bearerTokenPrefix}${auth.token}`
          break
        case AUTH_TYPES.HEADERS:
          for (const header of auth.headers) {
            headers[header.header] = header.value
          }
          break
        default:
          break
      }
    }

    const response = await fetch(mcpServerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `HTTP error! status: ${response.status}, body: ${errorText}`,
      )
    }

    const result = await response.json()

    if (result.jsonrpc !== TEXT.jsonRpcVersion) {
      throw new Error("Invalid JSON-RPC 2.0 response")
    }

    if (result.error) {
      throw new Error(`MCP tool error: ${result.error.message}`)
    }

    let content = result.result?.content || result.result

    if (Array.isArray(content) && content.length > 0) {
      const firstItem = content[0]
      if (firstItem.type === "text" && firstItem.text) {
        content = firstItem.text
      }
    }

    return {
      content,
      success: true,
    }
  } catch (error) {
    logger.error("[automated-response] callMCPTool failed", {
      error,
      mcpServerUrl,
      toolName,
    })
    return {
      error: error instanceof Error ? error.message : TEXT.unknownError,
      success: false,
    }
  }
}

export function cleanSchemaForGemini(schema: unknown): unknown {
  if (!schema || typeof schema !== JSON_TYPE.object) {
    return schema
  }

  const cleaned: Record<string, unknown> = {
    ...(schema as Record<string, unknown>),
  }

  if (cleaned.properties && typeof cleaned.properties === JSON_TYPE.object) {
    const cleanedProperties: Record<string, unknown> = {
      ...(cleaned.properties as Record<string, unknown>),
    }

    for (const [key, prop] of Object.entries(cleanedProperties)) {
      if (prop && typeof prop === JSON_TYPE.object) {
        const original = prop as JsonSchemaLike
        let nextProp: JsonSchemaLike = { ...original }

        if (
          typeof nextProp.type === "string" &&
          nextProp.type !== JSON_TYPE.object &&
          nextProp.required
        ) {
          const { required: _omit, ...rest } = nextProp
          nextProp = rest
        }

        if (nextProp.properties) {
          nextProp.properties = cleanSchemaForGemini(nextProp.properties)
        }

        if (nextProp.items) {
          nextProp.items = cleanSchemaForGemini(nextProp.items)
        }

        cleanedProperties[key] = nextProp
      }
    }

    cleaned.properties = cleanedProperties
  }

  return cleaned
}

type JsonSchemaLike = {
  type?: unknown
  required?: unknown
  properties?: unknown
  items?: unknown
  [key: string]: unknown
}
