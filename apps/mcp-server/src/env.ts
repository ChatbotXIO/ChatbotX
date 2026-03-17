import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    CHATBOTX_API_KEY: z.string().min(1, "Missing API_KEY"),
    CHATBOTX_API_URL: z.url().default("https://api.chatbotx.io"),
    CHATBOTX_ALLOW_SELF_SIGNED_CERT: z.enum(["true", "false"]).optional(),
    CHATBOTX_MCP_TRANSPORT: z.enum(["stdio", "sse", "both"]).default("both"),
    CHATBOTX_MCP_HOST: z.string().default("0.0.0.0"),
    CHATBOTX_MCP_PORT: z.coerce.number().int().positive().default(3333),
    CHATBOTX_MCP_SSE_PATH: z.string().default("/sse"),
    CHATBOTX_MCP_MESSAGES_PATH: z.string().default("/messages"),
  },
  runtimeEnv: process.env,
})
