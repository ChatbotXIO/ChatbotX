import { describe, expect, test } from "vitest"
import {
  whatsappCredentialPublicSchema,
  whatsappCredentialSchema,
  whatsappCredentialUpdateSchema,
} from "../src/partials/credential"

const base = {
  clientId: "app-id",
  version: "v25.0",
  configId: "signup-config",
  systemUserId: "system-user",
  businessName: "Acme",
  verifyToken: "verify",
  clientSecret: "secret",
  systemUserToken: "system-token",
}

describe("whatsappCredentialSchema — capiConfigId", () => {
  test("parses a stored credential that predates the field", () => {
    const parsed = whatsappCredentialSchema.parse(base)

    expect(parsed.capiConfigId).toBeUndefined()
  })

  test("round-trips the config id when present", () => {
    const parsed = whatsappCredentialSchema.parse({
      ...base,
      capiConfigId: "1234567890",
    })

    expect(parsed.capiConfigId).toBe("1234567890")
  })

  test("exposes the config id publicly but never a secret", () => {
    const parsed = whatsappCredentialPublicSchema.parse({
      ...base,
      capiConfigId: "1234567890",
    })

    expect(parsed.capiConfigId).toBe("1234567890")
    expect(parsed).not.toHaveProperty("clientSecret")
    expect(parsed).not.toHaveProperty("systemUserToken")
  })

  test("update schema accepts a submission from an admin who has not configured it", () => {
    const parsed = whatsappCredentialUpdateSchema.parse(base)

    expect(parsed.capiConfigId).toBeUndefined()
  })

  test("update schema trims the config id", () => {
    const parsed = whatsappCredentialUpdateSchema.parse({
      ...base,
      capiConfigId: "  1234567890  ",
    })

    expect(parsed.capiConfigId).toBe("1234567890")
  })
})
