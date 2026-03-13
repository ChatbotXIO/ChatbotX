import "dotenv/config"
import { env } from "./env"
import { createMcpServer } from "./server/create-mcp-server"
import { runSseServer } from "./server/sse-server"
import { runStdioServer } from "./server/stdio-server"

async function main() {
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
