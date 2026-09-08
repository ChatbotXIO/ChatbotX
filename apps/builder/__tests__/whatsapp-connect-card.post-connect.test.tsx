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

describe("WhatsappCreate connect card — post-connect stages", () => {
  const harness = createCardHarness()
  const { checkboxes, click, clickButtonByText, flush, relayCode } = harness

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

  describe("post-connect stages", () => {
    test("clears the OAuth code on the first CONNECTED result", async () => {
      connectActionMock.mockImplementationOnce(async () =>
        connectedResult({ phoneNumberId: "phone-single" }),
      )

      relayCode()
      await flush()

      // A stale code would re-fire the auto-submit effect; the action must
      // only ever have been called once for this one relayed code.
      expect(connectActionMock).toHaveBeenCalledTimes(1)
    })

    test("the form's code field is reset to '' — relaying the same code again re-fires the auto-submit", async () => {
      connectActionMock.mockImplementationOnce(async () =>
        connectedResult({ phoneNumberId: "phone-single" }),
      )

      relayCode()
      await flush()
      expect(connectActionMock).toHaveBeenCalledTimes(1)

      // If `code` had not been reset to "", relaying the identical value
      // would not register as a change and the watcher-driven auto-submit
      // effect would never fire a second time.
      connectActionMock.mockImplementationOnce(async () =>
        connectedResult({ phoneNumberId: "phone-single-2" }),
      )
      relayCode()
      await flush()
      expect(connectActionMock).toHaveBeenCalledTimes(2)
    })

    test("batch: verification queue then manual-result, ending in a single final redirect", async () => {
      connectActionMock.mockImplementationOnce(async () =>
        phoneNumberSelectionResult(),
      )
      relayCode()
      await flush()

      // PHONE_A needs OTP verification (its `integrationId` must be a valid
      // bigint-string — the verification panel's own form validates it);
      // PHONE_B has a manual result and needs no verification.
      connectActionMock.mockImplementation(
        (input: MockedConnectActionInput = {}) => {
          const id = (input.phoneNumberId as string | undefined) ?? ""
          if (id === PHONE_A.id) {
            return Promise.resolve(
              connectedResult({
                phoneNumberId: id,
                integrationId: "111",
                coexistEligible: false,
                extra: { requiresPhoneVerification: true },
              }),
            )
          }
          return Promise.resolve(
            connectedResult({
              phoneNumberId: id,
              coexistEligible: false,
              extra: {
                manual: {
                  integrationId: `integration-${id}`,
                  workspaceId: "ws-1",
                  webhookUrl: "https://broker.test/webhook",
                  verifyToken: "verify-token-1",
                },
              },
            }),
          )
        },
      )

      const [, first, second] = checkboxes()
      click(first)
      click(second)
      clickButtonByText("actions.connect")
      await flush(50)

      // The status dialog portals into document.body (Base UI's default
      // Dialog portal target), not into `container`. Both rows have
      // finished; the dialog stays on its own "connecting" done screen
      // until Continue is clicked, advancing into the "verification" extra
      // step.
      const continueButton = Array.from(
        document.body.querySelectorAll("button"),
      ).find((btn) => btn.textContent === "actions.continue")
      act(() => {
        continueButton?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        )
      })
      await flush()

      expect(document.body.textContent).toContain(
        "whatsapp.phoneVerification.title",
      )

      // Drive the real verification panel: enter a 6-digit code and submit.
      const codeInput =
        document.body.querySelector<HTMLInputElement>('input[name="code"]')
      act(() => {
        setNativeInputValue(codeInput, "123456")
      })
      await flush()

      const verifyButton = Array.from(
        document.body.querySelectorAll("button"),
      ).find((btn) =>
        btn.textContent?.includes("whatsapp.phoneVerification.actions.verify"),
      )
      act(() => {
        verifyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
      await flush(50)

      // Verifying the only row in the queue advances to manual-result,
      // since PHONE_B still needs it. "whatsapp.manualOnboarding.title" alone
      // is not proof of this — the dialog's stepper renders every step's
      // label up front, including ones not yet reached — so this checks the
      // "Done" button, which only exists on the manual-result body itself.
      const doneButton = Array.from(
        document.body.querySelectorAll("button"),
      ).find((btn) =>
        btn.textContent?.includes("whatsapp.manualOnboarding.goToInbox"),
      )
      expect(doneButton).toBeDefined()
      expect(pushMock).not.toHaveBeenCalled()

      act(() => {
        doneButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        // The redirect is not instant — a second click must not fire a
        // second one, and the button must show it is spent.
        doneButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
      await flush()

      expect(pushMock).toHaveBeenCalledTimes(1)
      expect(pushMock).toHaveBeenCalledWith("/space/ws-1")
      // The step is spent: it is either gone with the dialog or disabled
      // (`isDone`) — never clickable into a second redirect.
      const spentDone = Array.from(
        document.body.querySelectorAll("button"),
      ).find((btn) =>
        btn.textContent?.includes("whatsapp.manualOnboarding.goToInbox"),
      )
      expect(spentDone === undefined || spentDone.disabled).toBe(true)
    })
  })
})
