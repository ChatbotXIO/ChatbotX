import { z } from "zod"

export const helpTexts = {
  assistantFoundPrefix: "I've found some information for you:",
  followUpUserInstruction:
    "Based on the search results, please answer the customer's question in a natural and helpful way. Search results:",
  fileSearchNoResult: "No files matching the search query were found.",
  fileSearchErrorPrefix: "Error while searching files:",
  fileSearchFoundPrefix: (count: number) => `Found ${count} matching file(s):`,
  foundProductsFallbackPrefix:
    "I found some products that may be suitable for {{gender}}:",
  // MCP related texts
  jsonRpcVersion: "2.0",
  contentType: "application/json",
  bearerTokenPrefix: "Bearer ",
  unknownError: "Unknown error",
  // Follow-up instruction
  followUpInstruction:
    "Please answer my question based on the following information:",
  // File search tool descriptions
  fileSearchDescription:
    "Search uploaded files for information about products, policies, and company details. Do NOT use for greetings or casual salutations.",
  fileSearchQueryDescription: "Search keywords to find relevant information",
  fallbackLookup:
    "I've found some data, but I couldn't generate a complete answer yet. Could you please specify what you're looking for (price, size, color)?",
  toolOutputGuard: [
    "IMPORTANT RULES (REQUIRED):",
    "- Never send raw JSON or tool outputs directly to the user.",
    "- If you use a tool, summarize the result concisely in natural language.",
    "- Only provide the most relevant information the customer is asking for.",
  ].join("\n"),
  extractFieldValuePrompt:
    'Extract the following information for the field "{{customFieldId}}" from this text: "{{fullText}}"',
} as const

export const mcpConstants = {
  protocolVersion: "2024-11-05",
  clientInfo: { name: "AhaChat-Worker", version: "1.0.0" },
  /** MCP JSON-RPC method names (Model Context Protocol) */
  jsonRpcMethods: {
    initialize: "initialize",
    notificationsInitialized: "notifications/initialized",
    toolsList: "tools/list",
    toolsCall: "tools/call",
  },
} as const

export const aiTimeouts = {
  aiTotal: 120_000,
  aiStep: 60_000,
  aiChunk: 30_000,
  httpDefault: 30_000,
  mcpList: 30_000,
  mcpCall: 60_000,
} as const

export const toolPrefixes = z.enum(["file", "fn", "mcp"])

export const openaiEmbeddingModels = z.enum([
  "text-embedding-3-large",
  "text-embedding-3-small",
  "text-embedding-ada-002",
])
export type OpenAIEmbeddingModel = z.infer<typeof openaiEmbeddingModels>

export const geminiEmbeddingModels = z.enum(["text-embedding-004"])
export type GeminiEmbeddingModel = z.infer<typeof geminiEmbeddingModels>

export const supportedImageExtensions = z.enum([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
])
export type SupportedImageExtension = z.infer<typeof supportedImageExtensions>

export const MAX_CONVERSATION_HISTORY = 100
