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

  console.log("\n---\n")

  // Test create_tag
  console.log("✏️ Testing create_tag...")
  try {
    const createTagResult = await tags.create_tag.execute(api, {
      name: `Test Tag ${Date.now()}`,
    })
    console.log("✅ create_tag result:", createTagResult)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.log("❌ create_tag error:", message)
  }

  console.log("\n---\n")

  // Test create_custom_field
  console.log("✏️ Testing create_custom_field...")
  try {
    const createFieldResult = await customFields.create_custom_field.execute(
      api,
      {
        name: `Test Field ${Date.now()}`,
        customFieldType: "shortText",
      },
    )
    console.log("✅ create_custom_field result:", createFieldResult)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.log("❌ create_custom_field error:", message)
  }
}

testTools()
