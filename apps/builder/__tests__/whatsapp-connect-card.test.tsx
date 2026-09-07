import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  connectedResult,
  createCardHarness,
  installDomPolyfills,
  type MockedConnectActionInput,
  type MockedConnectActionResult,
  PHONE_A,
  phoneNumberSelectionResult,
  setNativeInputValue,
} from "./whatsapp-connect-card.test-utils"

const {
  pushMock,
  connectActionMock,
  setCoexistWhatsappAPI,
  listWhatsappPhoneNumbersInternalAPI,
  toastErrorMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  connectActionMock: vi.fn<
    (input?: MockedConnectActionInput) => Promise<MockedConnectActionResult>
  >(async () => ({ data: undefined })),
  setCoexistWhatsappAPI: vi.fn(),
  listWhatsappPhoneNumbersInternalAPI: vi.fn(),
  toastErrorMock: vi.fn(),
}))

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

vi.mock("@/features/integration-whatsapp/actions/connect.action", () => ({
  connectWhatsappAction: connectActionMock,
}))

// The picker fans out over the oRPC route now (a server action cannot run in
// parallel), while the top-level form keeps the action. Both funnel into the
// same mock here — the transport returns the result directly, where the
// action wraps it in next-safe-action's `{ data }` envelope.
vi.mock("@/features/channel-connect/lib/connect-client", () => ({
  connectViaApi: async ({ body }: { body: Record<string, unknown> }) =>
    (await connectActionMock(body))?.data,
}))

vi.mock("@/features/integration-whatsapp/verification/actions", () => ({
  requestWhatsappVerificationCodeAction: vi.fn(async () => ({
    data: undefined,
  })),
  verifyWhatsappPhoneCodeAction: vi.fn(async () => ({ data: undefined })),
}))

vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => null,
}))

vi.mock("@/features/shared/coexist-popup", () => ({
  CoexistPopup: () => null,
}))

// Coexist and the manual phone-number listing both go through the typed oRPC
// client now: `/api` serves only `publicRouter`, so those session-authenticated
// procedures 404 there.
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    integrationWhatsappAPIs: {
      setCoexistWhatsappAPI,
      listWhatsappPhoneNumbersInternalAPI,
    },
  },
}))

installDomPolyfills()

describe("WhatsappCreate connect card", () => {
  const harness = createCardHarness()
  const { click, clickButtonByText, flush, radios, relayCode, switches } =
    harness
  const container = () => harness.container

  beforeEach(() => {
    pushMock.mockClear()
    connectActionMock.mockReset()
    connectActionMock.mockImplementation(async () => ({ data: undefined }))
    setCoexistWhatsappAPI.mockReset()
    listWhatsappPhoneNumbersInternalAPI.mockReset()
    toastErrorMock.mockClear()
    harness.mount()
  })

  afterEach(() => {
    harness.unmount()
  })

  test("offers the connect options unfrozen before Meta returns a code", () => {
    expect(switches().length).toBeGreaterThan(0)
    expect(container().querySelector("fieldset")?.disabled).toBe(false)
  })

  test("freezes the connect options in place instead of hiding them", () => {
    const statesBefore = switches().map((el) => el.getAttribute("aria-checked"))

    relayCode()

    expect(container().querySelector("fieldset")?.disabled).toBe(true)
    expect(switches().map((el) => el.getAttribute("aria-checked"))).toEqual(
      statesBefore,
    )
  })

  test("a retry after a failed signup reaches the action again, with no validation copy", async () => {
    // The action never rejects — `handleServerError` turns a throw into a
    // `{ serverError }` result (see `@/lib/safe-action`), which is what sets
    // `action.hasErrored` and so `hasFailed`.
    connectActionMock.mockResolvedValueOnce({
      serverError: "connect blew up",
    } as MockedConnectActionResult)
    relayCode("failing-code")
    await flush()

    connectActionMock.mockClear()
    connectActionMock.mockImplementationOnce(async () =>
      phoneNumberSelectionResult(),
    )
    relayCode("retry-code")
    await flush()

    // The failed attempt resets the picker field. Resetting it to `[]` made
    // it fail the 1..max rule, so `handleSubmit` blocked every later submit:
    // the retry never reached the action and the card stayed frozen on
    // "connecting". The absent validation copy is the same error seen from
    // the other side — `handleSubmit` stores it for the field whether or not
    // anything is rendering it.
    expect(connectActionMock).toHaveBeenCalledTimes(1)
    expect(container().textContent).not.toContain(
      "channels.connectMany.validation.min",
    )
  })

  describe("manual connect", () => {
    test("the manual radio still binds to a single scalar id and submits", async () => {
      listWhatsappPhoneNumbersInternalAPI.mockResolvedValue({
        data: [PHONE_A],
      })
      connectActionMock.mockImplementationOnce(
        async (input: MockedConnectActionInput = {}) =>
          connectedResult({
            phoneNumberId:
              (input.manualPhoneNumberId as string | undefined) ?? "",
          }),
      )

      // switches()[0] = connectExisting; clicking it reveals the manual
      // switch in place of transferPhoneNumber (switches()[1]).
      click(switches()[0])
      await flush()
      click(switches()[1])
      await flush()

      const wabaInput = container().querySelector<HTMLInputElement>(
        'input[name="wabaId"]',
      )
      const tokenInput = container().querySelector<HTMLInputElement>(
        'input[name="accessToken"]',
      )
      act(() => {
        setNativeInputValue(wabaInput, "waba-1")
        setNativeInputValue(tokenInput, "token-1")
      })

      clickButtonByText("actions.continue")
      await flush()

      expect(listWhatsappPhoneNumbersInternalAPI).toHaveBeenCalledWith({
        wabaId: "waba-1",
        accessToken: "token-1",
      })
      expect(radios()).toHaveLength(1)

      click(radios()[0])
      await flush()

      clickButtonByText("whatsapp.continueManualConnect")
      await flush()

      expect(connectActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          manualConnect: true,
          manualPhoneNumberId: PHONE_A.id,
        }),
      )
      const lastCall =
        connectActionMock.mock.calls.at(-1)?.[0] ??
        ({} as Record<string, unknown>)
      expect(Array.isArray(lastCall.manualPhoneNumberId)).toBe(false)
    })
  })
  describe("direct-submit failure toasts (top-level form's own auto-submit, not the picker)", () => {
    test("a limitReached outcome toasts its own reason key, not the generic notSelectable copy", async () => {
      connectActionMock.mockImplementationOnce(async () => ({
        data: {
          kind: "outcome",
          outcome: {
            sourceId: "phone-single",
            name: "phone-single",
            status: "limitReached",
            reason: "channelLimit",
            coexistEligible: false,
          },
        },
      }))

      relayCode()
      await flush()

      expect(toastErrorMock).toHaveBeenCalledWith(
        "channels.connectMany.reason.channelLimit",
      )
    })

    test("a providerRejected failure outcome toasts its own reason key, not the generic notSelectable copy", async () => {
      connectActionMock.mockImplementationOnce(async () => ({
        data: {
          kind: "outcome",
          outcome: {
            sourceId: "phone-single",
            name: "phone-single",
            status: "failed",
            reason: "providerRejected",
            coexistEligible: false,
          },
        },
      }))

      relayCode()
      await flush()

      expect(toastErrorMock).toHaveBeenCalledWith(
        "channels.connectMany.reason.providerRejected",
      )
    })

    test("a duplicated outcome still toasts the channel's duplicated key", async () => {
      connectActionMock.mockImplementationOnce(async () => ({
        data: {
          kind: "outcome",
          outcome: {
            sourceId: "phone-single",
            name: "phone-single",
            status: "duplicated",
            reason: "alreadyConnected",
            coexistEligible: false,
          },
        },
      }))

      relayCode()
      await flush()

      expect(toastErrorMock).toHaveBeenCalledWith(
        "channels.duplicated.whatsapp",
      )
    })
  })
})
