import { describe, expect, test } from "vitest"
import { toConnectResultIntent } from "@/features/integration-whatsapp/libs/connect-result-intent"
import { CONNECT_WHATSAPP_RESULT_TYPES } from "@/features/integration-whatsapp/schema"

const OUTCOME = {
  sourceId: "phone-1",
  name: "phone-1",
  status: "failed" as const,
  reason: "unknown" as const,
  coexistEligible: false,
}

const CONNECTED_OUTCOME = {
  sourceId: "phone-1",
  name: "phone-1",
  status: "connected" as const,
  integrationId: "integration-1",
  coexistEligible: false,
}

describe("toConnectResultIntent", () => {
  test("maps a sessionError wire result to the sessionError intent", () => {
    const intent = toConnectResultIntent({
      kind: "sessionError",
      code: "sessionExpired",
    })

    expect(intent).toEqual({ kind: "sessionError", code: "sessionExpired" })
  })

  test("maps an outcome wire result to the itemFailure intent", () => {
    const intent = toConnectResultIntent({
      kind: "outcome",
      outcome: OUTCOME,
    })

    expect(intent).toEqual({ kind: "itemFailure", outcome: OUTCOME })
  })

  test("maps a phoneNumberSelection result to the selection intent", () => {
    const phoneNumbers = [
      { id: "phone-1", label: "Phone 1", displayPhoneNumber: "+1 555 0001" },
    ]

    const intent = toConnectResultIntent({
      type: CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBER_SELECTION,
      signupSessionId: "session-1",
      phoneNumbers,
    })

    expect(intent).toEqual({
      kind: "selection",
      signupSessionId: "session-1",
      phoneNumbers,
    })
  })

  test("maps noPhoneNumberCandidates to a toastError with the empty-candidates key", () => {
    const intent = toConnectResultIntent({
      type: CONNECT_WHATSAPP_RESULT_TYPES.NO_PHONE_NUMBER_CANDIDATES,
    })

    expect(intent).toEqual({
      kind: "toastError",
      messageKey: "fields.phoneNumberId.noPhoneNumbersFound",
    })
  })

  test("maps phoneNumbersAlreadyConnected to a toastError with the duplicated key", () => {
    const intent = toConnectResultIntent({
      type: CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBERS_ALREADY_CONNECTED,
    })

    expect(intent).toEqual({
      kind: "toastError",
      messageKey: "channels.duplicated.whatsapp",
    })
  })

  test("maps a connected result to the connected intent", () => {
    const intent = toConnectResultIntent({
      type: CONNECT_WHATSAPP_RESULT_TYPES.CONNECTED,
      workspaceId: "ws-1",
      isManual: false,
      redirectUrl: "/space/ws-1",
      outcome: CONNECTED_OUTCOME,
    })

    expect(intent).toEqual({
      kind: "connected",
      workspaceId: "ws-1",
      redirectUrl: "/space/ws-1",
      outcome: CONNECTED_OUTCOME,
    })
  })
})
