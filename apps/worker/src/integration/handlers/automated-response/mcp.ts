import ky, { type Options } from "ky"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import { isRecord } from "../../../lib/utils"
import { helpTexts } from "./constants"

type MCPSuccess = { content: unknown; success: true }
type MCPFailure = { error: string; success: false }
type MCPResult = MCPSuccess | MCPFailure

const legacyMcpResultSchema = z.union([
  z.object({
    success: z.literal(true),
    content: z.unknown(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string().trim().min(1),
  }),
])

const jsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]).optional()

const jsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
})

const mcpJsonRpcSuccessSchema = z.object({
  jsonrpc: z.literal(helpTexts.jsonRpcVersion),
  id: jsonRpcIdSchema,
  result: z.object({
    content: z.unknown().optional(),
    isError: z.boolean().optional(),
  }),
})

const mcpJsonRpcErrorResponseSchema = z
  .object({
    jsonrpc: z.literal(helpTexts.jsonRpcVersion),
    id: jsonRpcIdSchema,
    error: jsonRpcErrorSchema,
  })
  .passthrough()

export const mcpAuthTypes = z.enum(["none", "header", "token"])

const mcpAuthSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(mcpAuthTypes.enum.none),
  }),
  z.object({
    type: z.literal(mcpAuthTypes.enum.token),
    token: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal(mcpAuthTypes.enum.header),
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
  auth: unknown
  toolName: string
  args: Record<string, unknown>
}): Promise<MCPResult> {
  const { url, toolName, args } = props

  try {
    const authParsed = mcpAuthSchema.safeParse(props.auth)
    if (!authParsed.success) {
      return {
        success: false,
        error: "Invalid MCP auth configuration",
      }
    }
    const auth = authParsed.data

    const requestId = Date.now() + Math.floor(Math.random() * 1000)
    const requestOptions: Options = {
      throwHttpErrors: false,
      timeout: 120_000,
      json: {
        jsonrpc: helpTexts.jsonRpcVersion,
        id: requestId,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      },
    }
    switch (auth.type) {
      case mcpAuthTypes.enum.header:
        {
          const headers: Record<string, string> = {}
          for (const h of auth.headers) {
            headers[h.header] = h.value
          }
          requestOptions.headers = headers
        }
        break
      case mcpAuthTypes.enum.token:
        requestOptions.headers = {
          Authorization: `Bearer ${auth.token}`,
        }
        break
      default:
        break
    }

    requestOptions.headers = {
      Accept: helpTexts.contentType,
      ...(requestOptions.headers ?? {}),
    }

    let parsed: unknown = null
    try {
      parsed = await ky.post(url, requestOptions).json()
    } catch (error) {
      const parsedError = normalizeError(error)
      logger.error(parsedError, "[automated-response] callMCPTool failed")

      return {
        success: false,
        error: "MCP response is not valid JSON",
      }
    }

    const legacyParsed = legacyMcpResultSchema.safeParse(parsed)
    if (legacyParsed.success) {
      if (!legacyParsed.data.success) {
        return legacyParsed.data
      }
      const normalized = normalizeMcpContent(legacyParsed.data.content)
      return {
        success: true,
        content: normalized,
      }
    }

    const rpcErrorParsed = mcpJsonRpcErrorResponseSchema.safeParse(parsed)
    if (rpcErrorParsed.success) {
      return {
        success: false,
        error: rpcErrorParsed.data.error.message,
      }
    }

    const rpcSuccessParsed = mcpJsonRpcSuccessSchema.safeParse(parsed)
    if (!rpcSuccessParsed.success) {
      return {
        success: false,
        error: "Invalid JSON-RPC 2.0 response",
      }
    }

    const result = rpcSuccessParsed.data.result
    const normalized = normalizeMcpContent(result.content)

    if (result.isError) {
      return {
        success: false,
        error:
          typeof normalized === "string" && normalized.trim().length > 0
            ? normalized
            : "MCP tool returned an error",
      }
    }

    return {
      success: true,
      content: normalized,
    }
  } catch (error) {
    logger.error(error, "[automated-response] callMCPTool failed")
    return {
      error: error instanceof Error ? error.message : helpTexts.unknownError,
      success: false,
    }
  }
}

function normalizeMcpContent(content: unknown): unknown {
  if (!Array.isArray(content) || content.length === 0) {
    return content
  }

  const firstItem = content[0]
  if (!isRecord(firstItem)) {
    return content
  }

  if (firstItem.type === "text" && typeof firstItem.text === "string") {
    return firstItem.text
  }

  return content
}
