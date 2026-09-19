import { describe, expect, test, vi } from "vitest"

// Real `useOptionalWhatsappVoipCallContext` chains into server actions that
// need `DATABASE_URL`; mocked so importing the module under test doesn't
// touch that chain.
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useOptionalWhatsappVoipCallContext: () => null,
  }),
)

const {
  CAPABILITY_ALERT_TITLE_KEYS,
  MIC_PERMISSION_OUTCOMES,
  NONE_REASON_MESSAGE_KEYS,
  OUTCOME_MESSAGE_KEYS,
} = await import(
  "@/features/integration-whatsapp/calling/voip/use-whatsapp-call-starter"
)

// These maps are the single source every call trigger (header button,
// call-back, contact panel) maps an outcome/reason/category through.
describe("use-whatsapp-call-starter — outcome-map parity", () => {
  test("OUTCOME_MESSAGE_KEYS covers exactly the outcomes a failed/refused dial can resolve to (never the silent local no-ops)", () => {
    expect(Object.keys(OUTCOME_MESSAGE_KEYS).sort()).toEqual(
      [
        "needsPermission",
        "callAlreadyInProgress",
        "dailyLimitReached",
        "ineligibleNumber",
        "recipientUncallable",
        "temporarilyDisabled",
        "rateLimited",
        "paymentIssue",
        "callingNotEnabled",
        "callFailed",
        "micPermissionDenied",
        "micNotFound",
        "callAccessDenied",
      ].sort(),
    )
    // "dialing"/"occupied"/"cancelled" are purely local, silent no-ops —
    // never present.
    expect(OUTCOME_MESSAGE_KEYS).not.toHaveProperty("dialing")
    expect(OUTCOME_MESSAGE_KEYS).not.toHaveProperty("occupied")
    expect(OUTCOME_MESSAGE_KEYS).not.toHaveProperty("cancelled")
  })

  test("MIC_PERMISSION_OUTCOMES is exactly the two mic-related outcomes", () => {
    expect([...MIC_PERMISSION_OUTCOMES].sort()).toEqual(
      ["micPermissionDenied", "micNotFound"].sort(),
    )
  })

  test("every mic-permission outcome also has a message key (the mic-permission alert still needs copy)", () => {
    for (const outcome of MIC_PERMISSION_OUTCOMES) {
      expect(OUTCOME_MESSAGE_KEYS[outcome]).toBeDefined()
    }
  })

  test("NONE_REASON_MESSAGE_KEYS covers every NoneCallModeReason", () => {
    expect(Object.keys(NONE_REASON_MESSAGE_KEYS).sort()).toEqual(
      [
        "callingNotEnabled",
        "webhookNotSubscribed",
        "tokenInvalid",
        "ineligibleNumber",
        "notWhatsappConversation",
        "callAccessDenied",
        "businessCallingUnavailable",
      ].sort(),
    )
  })

  test("CAPABILITY_ALERT_TITLE_KEYS covers every CapabilityAlertCategory", () => {
    expect(Object.keys(CAPABILITY_ALERT_TITLE_KEYS).sort()).toEqual(
      ["eligibility", "micPermission", "dialFailure"].sort(),
    )
  })
})
