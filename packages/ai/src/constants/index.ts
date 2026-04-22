import { z } from "zod"

export const helpTexts = {
  fileSearchNoResult: "No files matching the search query were found.",
  fileSearchFoundPrefix: (count: number) => `Found ${count} matching file(s):`,
  // MCP related texts
  jsonRpcVersion: "2.0",
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
} as const

export const mcpConstants = {
  protocolVersion: "2024-11-05",
  clientInfo: { name: "AhaChat-Worker", version: "1.0.0" },
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

export const systemFunctionNames = {
  connectUserToHuman: "connect_user_to_human",
} as const

export const aiPolicies = {
  handoff: [
    "HANDOFF POLICY (REQUIRED):",
    `- Only call '${systemFunctionNames.connectUserToHuman}' if the user explicitly asks for a human agent OR if you cannot resolve the issue after 2-3 attempts.`,
    "- If the user's intent is ambiguous, ask for confirmation (e.g., 'Would you like to speak with a human agent?') before calling the tool.",
    "- Do NOT call this tool for greetings, small talk, or issues that can be resolved using other available tools.",
    "- After calling the tool, inform the user that they are being connected to a human agent.",
  ].join("\n"),
} as const

export const toolPrefixes = z.enum(["file", "fn", "mcp", "sys"])

export const MAX_CONVERSATION_HISTORY = 100
