import { zodToConfigFields } from "@chatbotx.io/utils/connection"
import { describe, expect, test } from "vitest"
import { apiConnectConfigSchema } from "../src/integration-api/schema"
import { webchatConnectConfigSchema } from "../src/integration-webchat/schema"

// The integrations call `zodToConfigFields` at module load, so a schema it
// cannot convert would crash builder/worker boot. Pin the real catalog output.
describe("self-serve connect config fields", () => {
  test("API channel exposes a required name and an optional callback URL", () => {
    expect(zodToConfigFields(apiConnectConfigSchema)).toEqual([
      { name: "name", type: "string", required: true },
      { name: "callbackUrl", type: "url", format: "uri", required: false },
    ])
  })

  test("webchat only requires a name and flattens union array items", () => {
    const fields = zodToConfigFields(webchatConnectConfigSchema)
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))

    expect(fields.filter((f) => f.required).map((f) => f.name)).toEqual([
      "name",
    ])
    expect(byName.welcomeFlowId).toMatchObject({
      type: "string",
      format: "bigint-string",
    })
    expect(byName.authorizedDomains).toMatchObject({
      type: "array",
      items: { type: "string" },
    })
    for (const name of ["conversationStarters", "persistentMenus"]) {
      expect(byName[name]?.items?.type).toBe("object")
      expect(
        byName[name]?.items?.fields?.map((f) => [f.name, f.type, f.required]),
      ).toEqual([
        ["label", "string", true],
        ["type", "enum", true],
        ["flowId", "string", false],
        ["url", "url", false],
      ])
    }
  })
})
