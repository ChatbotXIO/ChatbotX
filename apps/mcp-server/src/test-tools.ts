import "dotenv/config"
import { loadOpenApiSpec } from "./openapi-loader"

async function testTools() {
  console.log("🧪 Testing MCP Server Tools...\n")

  const tools = await loadOpenApiSpec()

  console.log(`✅ Loaded ${tools.length} tools from OpenAPI spec:\n`)
  for (const tool of tools) {
    const paramCount = Object.keys(tool.inputSchema.properties).length
    console.log(`  • ${tool.name} (${paramCount} params) — ${tool.description}`)
  }
}

testTools().catch(console.error)
