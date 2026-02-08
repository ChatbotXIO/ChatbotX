import ky, { type Options } from "ky"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import { JSON_TYPE, TEXT } from "./constants"

type MCPSuccess = { content: unknown; success: true }
type MCPFailure = { error: string; success: false }
type MCPResult = MCPSuccess | MCPFailure

export const mcpAuthTypes = {
  none: "none",
  header: "header",
  token: "token",
} as const

const mcpAuthSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(mcpAuthTypes.none),
  }),
  z.object({
    type: z.literal(mcpAuthTypes.token),
    token: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal(mcpAuthTypes.header),
    headers: z.array(
      z.object({
        header: z.string().trim().min(1),
        value: z.string().trim().min(1),
      }),
    ),
  }),
])
export type MCPAuthSchema = z.infer<typeof mcpAuthSchema>

export async function callMCPTool(props: {
  url: string
  auth: MCPAuthSchema
  toolName: string
  args: Record<string, unknown>
}): Promise<MCPResult> {
  const { url, auth, toolName, args } = props

  try {
    const requestOptions: Options = {
      json: {
        jsonrpc: TEXT.jsonRpcVersion,
        id: Date.now() + Math.floor(Math.random() * 1000),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      },
    }
    switch (auth.type) {
      case mcpAuthTypes.header:
        requestOptions.headers = {
          ...auth.headers.reduce(
            (acc, header) => {
              acc[header.header] = header.value
              return acc
            },
            {} as Record<string, string>,
          ),
        }
        break
      case mcpAuthTypes.token:
        requestOptions.headers = {
          Authorization: `Bearer ${auth.token}`,
        }
        break
      default:
        break
    }

    const result = await ky.post(url, requestOptions).json<MCPResult>()

    if (!result.success) {
      throw new Error("Invalid JSON-RPC 2.0 response")
    }

    let content = result.content

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
    logger.error(error, "[automated-response] callMCPTool failed")
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
