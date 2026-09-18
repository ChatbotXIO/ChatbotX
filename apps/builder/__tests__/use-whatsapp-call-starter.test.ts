import { describe, expect, test, vi } from "vitest"

// The module under test imports `useOptionalWhatsappVoipCallContext`, whose
// real implementation chains into `use-whatsapp-voip-call.ts` and from
// there into several server actions (`packages/business` /
// `packages/database`, which need `DATABASE_URL`). These tests only need
// the plain exported maps — mocked here the same way
// `whatsapp-voip-call-button.test.tsx` mocks it, so importing the module
// never touches that chain.
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

/**
 * P4 item 1 — "starter hook outcome-map parity": the maps extracted from
 * `WhatsappVoipCallButton` into `use-whatsapp-call-starter.tsx` are the
 * single source every call trigger (header button, call-back, contact
 * panel) will map an outcome/reason/category through. These tests pin
 * their shape directly (rather than only through the header button's own
 * DOM tests) so any future caller can rely on them without re-deriving.
 */
describe("use-whatsapp-call-starter — outcome-map parity", () => {
  // LOW 11: the "every value follows the whatsapp.calls.outbound.<outcome>
  // convention" test removed here was tautological against these literal,
  // hand-written map entries — it could only ever fail together with (and
  // add nothing beyond) the exact key-set pin immediately below, which is
  // kept as the real regression guard.
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
      ].sort(),
    )
  })

  test("CAPABILITY_ALERT_TITLE_KEYS covers every CapabilityAlertCategory", () => {
    expect(Object.keys(CAPABILITY_ALERT_TITLE_KEYS).sort()).toEqual(
      ["eligibility", "micPermission", "dialFailure"].sort(),
    )
  })
})
