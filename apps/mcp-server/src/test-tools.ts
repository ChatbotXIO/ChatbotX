import "dotenv/config"
import { createChatbotXAPI } from "@chatbotx/public-apis"
import { getChatbotXConfigFromEnv } from "./config"
import customFields from "./tools/custom-fields"
import tags from "./tools/tag"

const api = createChatbotXAPI(getChatbotXConfigFromEnv())

async function testTools() {
  console.log("🧪 Testing MCP Server Tools...\n")

  // Test list_tags
  console.log("📋 Testing list_tags...")
  try {
    const listTagsResult = await tags.list_tags.execute(api)
    console.log("✅ list_tags result:", listTagsResult)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.log("❌ list_tags error:", message)
  }

  console.log("\n---\n")

  // Test list_custom_fields
  console.log("📋 Testing list_custom_fields...")
  try {
    const listFieldsResult = await customFields.list_custom_fields.execute(api)
    console.log("✅ list_custom_fields result:", listFieldsResult)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.log("❌ list_custom_fields error:", message)
  }
}

testTools()
