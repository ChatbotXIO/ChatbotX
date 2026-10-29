import { env } from "@/env"

const trailingSlash = /\/$/

export const getMcpPublicUrl = (): string =>
  (
    env.MCP_PUBLIC_URL ?? new URL("/mcp", env.BETTER_AUTH_URL).toString()
  ).replace(trailingSlash, "")
