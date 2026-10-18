// @vitest-environment node

import { describe, expect, test } from "vitest"
import { publicDecisionConnectionSchema } from "./public"

describe("publicDecisionConnectionSchema", () => {
  test("rejects a provider credential in a response payload", () => {
    expect(() =>
      publicDecisionConnectionSchema.parse({
        credential: "secret-provider-key",
        credentialConfigured: true,
        defaultModel: "router-model",
        endpoint: "https://provider.example/v1",
        id: "1",
        lastTest: { status: "passed", testedAt: new Date("2026-10-01") },
        modelCatalog: ["router-model"],
        name: "Primary router",
        providerKind: "systemOneCompatible",
        status: "enabled",
      }),
    ).toThrow("credential")
  })
})
