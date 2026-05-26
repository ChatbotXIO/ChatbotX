import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    CHATBOTX_API_KEY: z.string().default(""),
    CHATBOTX_API_URL: z.url().default("https://api.chatbotx.io"),
    CHATBOTX_ALLOW_SELF_SIGNED_CERT: z.enum(["true", "false"]).optional(),
    CHATBOTX_MCP_TRANSPORT: z.enum(["stdio", "sse", "both"]).default("both"),
    CHATBOTX_MCP_HOST: z.string().default("0.0.0.0"),
    CHATBOTX_MCP_PORT: z.coerce.number().int().positive().default(3333),
    CHATBOTX_MCP_SSE_PATH: z.string().default("/sse"),
    CHATBOTX_MCP_MESSAGES_PATH: z.string().default("/messages"),
    CHATBOTX_MCP_CORS_ORIGIN: z.string().default("*"),
    CHATBOTX_MCP_SERVER_NAME: z.string().optional(),
    CHATBOTX_MCP_SERVER_INSTRUCTIONS: z
      .string()
      .default(
        "This MCP server is connected to the user's live ChatbotX workspace. Whenever the user asks about anything related to their ChatbotX workspace — tags, contacts, conversations, broadcasts, flows, sequences, team members, inboxes, or any workspace data — you MUST use the available MCP tools to fetch real-time data. Do NOT answer from training knowledge or provide ChatbotX product documentation.",
      ),
  },
  runtimeEnv: process.env,
})
