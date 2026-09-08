// @vitest-environment node
import { describe, expect, test } from "vitest"
import { isCoexistOnboardingIntent } from "@/features/integration-whatsapp/libs/embedded-signup"

/**
 * The picker offers "sync history" for exactly the onboarding mode Meta runs
 * the coexistence flow for — the same predicate the server keys its
 * eligibility check on, so the two can never disagree about what the browser
 * asked Meta for.
 */
describe("which WhatsApp onboarding modes can coexist", () => {
  test.each([
    ["connect existing, no transfer", true, false, false, true],
    ["transfer wins over connect existing", true, true, false, false],
    ["transfer only", false, true, false, false],
    ["neither (plain new-number signup)", false, false, false, false],
    ["manual connect, whatever the switches say", true, false, true, false],
    ["manual connect with transfer", false, true, true, false],
  ])("%s", (_name, connectExisting: boolean, transferPhoneNumber: boolean, manualConnect: boolean, expected: boolean) => {
    expect(
      isCoexistOnboardingIntent({
        connectExisting,
        transferPhoneNumber,
        manualConnect,
      }),
    ).toBe(expected)
  })
})
