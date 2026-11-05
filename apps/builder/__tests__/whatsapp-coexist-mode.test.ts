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
    ["connect existing", true, false, true],
    ["neither (plain new-number signup)", false, false, false],
    ["manual connect, whatever the switch says", true, true, false],
  ])("%s", (_name, connectExisting: boolean, manualConnect: boolean, expected: boolean) => {
    expect(isCoexistOnboardingIntent({ connectExisting, manualConnect })).toBe(
      expected,
    )
  })
})
