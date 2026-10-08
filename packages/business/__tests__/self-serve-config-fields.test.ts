import { zodToConfigFields } from "@chatbotx.io/utils/connection"
import { describe, expect, test } from "vitest"
import selfServeConfigFields from "../../../fixtures/self-serve-config-fields.json"
import { apiConnectConfigSchema } from "../src/integration-api/schema"
import { webchatConnectConfigSchema } from "../src/integration-webchat/schema"

describe("self-serve connect config fields", () => {
  test("matches the sandbox provider catalog fixture", () => {
    expect({
      api: zodToConfigFields(apiConnectConfigSchema),
      webchat: zodToConfigFields(webchatConnectConfigSchema),
    }).toEqual(selfServeConfigFields)
  })
})
