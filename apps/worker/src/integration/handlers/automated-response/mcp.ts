import { aiMcpServerAuth } from "@chatbotx.io/database/partials"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { McpClient, normalizeMcpContent } from "../../../lib/mcp-client"
import { helpTexts } from "./constants"

type MCPSuccess = { content: unknown; success: true }
type MCPFailure = { error: string; success: false }
type MCPResult = MCPSuccess | MCPFailure

export async function callMCPTool(props: {
  url: string
  auth: unknown
  toolName: string
  args: Record<string, unknown>
  abortSignal?: AbortSignal
}): Promise<MCPResult> {
  const { url, toolName, args } = props

  try {
    const auth = aiMcpServerAuth.parse(props.auth)
    const client = new McpClient({
      url,
      auth,
    })

    const result = await client.callTool(toolName, args)

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
    const normalizedError = normalizeError(error)
    logger.error(normalizedError, "[automated-response] callMCPTool failed")
    return {
      error: normalizedError.message || helpTexts.unknownError,
      success: false,
    }
  }
}
