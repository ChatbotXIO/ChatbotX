import type { ChatbotXAPI } from "@chatbotx/public-apis"
import type { ZodType } from "zod"

export interface McpContent {
  text: string
  type: "text"
}

export interface McpToolResult {
  content: McpContent[]
  isError?: boolean
  [key: string]: unknown
}

export interface ToolDefinition<TInput = Record<string, unknown>> {
  description: string
  execute: (api: ChatbotXAPI, input?: TInput) => Promise<McpToolResult>
  inputSchema?: ZodType<TInput>
}

export type ToolRegistry = Record<string, ToolDefinition<unknown>>
