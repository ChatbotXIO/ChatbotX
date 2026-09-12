import { describe, expect, test } from "vitest"
import { resolveSignaturePolicy } from "../src/lib/signature-policy"
import type { WhatsappConfig } from "../src/schema"

const config = (overrides: Partial<WhatsappConfig> = {}): WhatsappConfig => ({
  verifyToken: "verify-token",
  ...overrides,
})

describe("resolveSignaturePolicy", () => {
  test("enforces when a platform-credential integration has a secret", () => {
    expect(resolveSignaturePolicy(config({ clientSecret: "secret" }))).toBe(
      "enforce",
    )
  })

  test("enforces when a manual integration has provided its own secret", () => {
    expect(
      resolveSignaturePolicy(
        config({ clientSecret: "secret", manualIntegration: true }),
      ),
    ).toBe("enforce")
  })

  test("falls back to legacy-unverified for a manual integration with no secret", () => {
    expect(
      resolveSignaturePolicy(
        config({ clientSecret: undefined, manualIntegration: true }),
      ),
    ).toBe("legacy-unverified")
  })

  test("falls back to legacy-unverified when the secret is an empty string", () => {
    expect(
      resolveSignaturePolicy(
        config({ clientSecret: "", manualIntegration: true }),
      ),
    ).toBe("legacy-unverified")
  })

  test("enforces (rejects) a non-manual integration with no secret — a misconfiguration, not a legacy path", () => {
    expect(
      resolveSignaturePolicy(
        config({ clientSecret: undefined, manualIntegration: false }),
      ),
    ).toBe("enforce")
  })

  test("enforces (rejects) a non-manual integration with no secret when manualIntegration is unset", () => {
    expect(resolveSignaturePolicy(config({ clientSecret: undefined }))).toBe(
      "enforce",
    )
  })
})
