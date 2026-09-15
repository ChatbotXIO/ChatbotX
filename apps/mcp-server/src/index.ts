import "dotenv/config"
import { env } from "./env"
import { loadOpenApiSpec } from "./openapi-loader"
import { createMcpServer } from "./server/create-mcp-server"
import { runSseServer } from "./server/sse-server"
import { runStdioServer } from "./server/stdio-server"

async function main() {
  // Manual verification only: this intentionally mutates Node's global TLS policy.
  if (env.CHATBOTX_ALLOW_SELF_SIGNED_CERT === "true") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    console.error(
      "CHATBOTX_ALLOW_SELF_SIGNED_CERT=true disables TLS certificate verification.",
    )
  }

  await loadOpenApiSpec()

  if (env.CHATBOTX_MCP_TRANSPORT === "both") {
    await Promise.all([
      runStdioServer(createMcpServer),
      runSseServer(createMcpServer),
    ])
    return
  }

  if (env.CHATBOTX_MCP_TRANSPORT === "sse") {
    await runSseServer(createMcpServer)
    return
  }

  await runStdioServer(createMcpServer)
}

main().catch((error) => {
  console.error("Fatal error in main():", error)
  process.exit(1)
})
