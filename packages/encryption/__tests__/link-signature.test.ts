import { createHmac } from "node:crypto"
import { describe, expect, test } from "vitest"
import { env } from "../src/keys"
import { signMeLink, verifyMeLink } from "../src/link-signature"

const params = {
  workspaceId: "workspace-1",
  sourceId: "source-1",
  integrationId: "integration-1",
  formId: "system-field-1",
}

describe("me link signature", () => {
  test("signMeLink is deterministic", () => {
    const expected = createHmac(
      "sha256",
      Buffer.from(env.ENCRYPTION_KEY, "hex"),
    )
      .update("workspace-1:source-1:integration-1:system-field-1")
      .digest("hex")

    expect(signMeLink(params)).toBe(expected)
    expect(signMeLink(params)).toBe(signMeLink(params))
  })

  test("verifyMeLink rejects tampered and short hashes", () => {
    const hash = signMeLink(params)

    expect(verifyMeLink(params, hash)).toBe(true)
    expect(verifyMeLink({ ...params, sourceId: "other-source" }, hash)).toBe(
      false,
    )
    expect(verifyMeLink(params, "abc")).toBe(false)
    expect(verifyMeLink(params, null)).toBe(false)
  })
})
