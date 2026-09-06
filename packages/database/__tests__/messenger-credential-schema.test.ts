import { describe, expect, test } from "vitest"
import {
  messengerCredentialPublicSchema,
  messengerCredentialSchema,
  messengerCredentialUpdateSchema,
} from "../src/partials/credential"

const base = {
  clientId: "app-id",
  version: "v25.0",
  verifyToken: "verify",
  clientSecret: "secret",
}

describe("messengerCredentialSchema — marketingMessagesConfigId", () => {
  test("parses a stored credential that predates the field", () => {
    const parsed = messengerCredentialSchema.parse(base)

    expect(parsed.marketingMessagesConfigId).toBeUndefined()
  })

  test("round-trips the config id when present", () => {
    const parsed = messengerCredentialSchema.parse({
      ...base,
      marketingMessagesConfigId: "1234567890",
    })

    expect(parsed.marketingMessagesConfigId).toBe("1234567890")
  })

  test("exposes the config id publicly but never the secret", () => {
    const parsed = messengerCredentialPublicSchema.parse({
      ...base,
      marketingMessagesConfigId: "1234567890",
    })

    expect(parsed.marketingMessagesConfigId).toBe("1234567890")
    expect(parsed).not.toHaveProperty("clientSecret")
  })

  test("update schema accepts an empty submission from an admin who has not configured it", () => {
    const parsed = messengerCredentialUpdateSchema.parse(base)

    expect(parsed.marketingMessagesConfigId).toBeUndefined()
  })
})
