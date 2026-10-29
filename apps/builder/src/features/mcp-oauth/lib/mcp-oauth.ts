import { env } from "@/env"

const trailingSlash = /\/$/

export const mcpOAuthScopes = ["openid", "profile", "email", "offline_access"]

export const getMcpPublicUrl = (): string =>
  (
    env.MCP_PUBLIC_URL ?? new URL("/mcp", env.BETTER_AUTH_URL).toString()
  ).replace(trailingSlash, "")

export const getMcpPublicPath = (): string =>
  new URL(getMcpPublicUrl()).pathname.replace(trailingSlash, "")
