import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  connectedResult,
  createCardHarness,
  installDomPolyfills,
  type MockedConnectActionInput,
  type MockedConnectActionResult,
  PHONE_A,
  PHONE_B,
  phoneNumberSelectionResult,
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

describe("WhatsappCreate connect card — phone number picker", () => {
  const harness = createCardHarness()
  const {
    checkboxes,
    click,
    clickButtonByText,
    findButtonByText,
    flush,
    relayCode,
    switches,
  } = harness
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

  describe("multi-select phone number picker", () => {
    beforeEach(async () => {
      // "Connect an existing WhatsApp Business Account" — the one onboarding
      // mode Meta runs the coexistence flow for, and so the only one whose
      // picker offers "sync history".
      click(switches()[0])
      connectActionMock.mockImplementationOnce(async () =>
        phoneNumberSelectionResult(),
      )
      relayCode()
      await flush()
      // Only the setup call above happened so far — tests assert on calls
      // made from their own interactions.
      connectActionMock.mockClear()
    })

    test("renders the select-all header plus one checkbox per candidate", () => {
      expect(checkboxes()).toHaveLength(3)
      expect(container().textContent).toContain("Phone A")
      expect(container().textContent).toContain("Phone B")
    })

    test("select-all checks every candidate", () => {
      const [selectAll, ...options] = checkboxes()
      click(selectAll)

      for (const option of options) {
        expect(option.getAttribute("aria-checked")).toBe("true")
      }
    })

    test("Continue is disabled until at least one number is selected", () => {
      expect(findButtonByText("actions.connect")?.disabled).toBe(true)
    })

    test("a fresh selection opens without any validation copy (the form was already submitted once to reach Facebook)", () => {
      expect(container().textContent).not.toContain("Too small")
      expect(container().textContent).not.toContain(
        "channels.connectMany.validation.min",
      )
    })

    test("the validation copy appears only after the operator empties the selection themselves", async () => {
      const [, first] = checkboxes()
      click(first)
      await flush()
      expect(container().textContent).not.toContain(
        "channels.connectMany.validation.min",
      )

      click(first)
      await flush()
      expect(container().textContent).toContain(
        "channels.connectMany.validation.min",
      )
    })

    test("clicking the Select all text toggles every candidate, like its checkbox", () => {
      const label = container().querySelector("#connect-select-all-label")
      expect(label).not.toBeNull()
      click(label as HTMLElement)

      const [, ...options] = checkboxes()
      for (const option of options) {
        expect(option.getAttribute("aria-checked")).toBe("true")
      }
    })

    test("selecting exactly one number runs the inline single-number flow, not the status dialog", async () => {
      connectActionMock.mockImplementationOnce(
        async (input: MockedConnectActionInput = {}) =>
          connectedResult({
            phoneNumberId:
              (input.phoneNumberId as string | undefined) ?? PHONE_A.id,
          }),
      )

      const [, first] = checkboxes()
      click(first)
      clickButtonByText("actions.connect")
      await flush()

      expect(connectActionMock).toHaveBeenCalledTimes(1)
      expect(connectActionMock).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumberId: PHONE_A.id }),
      )
      expect(
        container().querySelector('[data-slot="connect-dialog-stepper"]'),
      ).toBeNull()
      // Regression guard (CRITICAL-1): the single-number path must actually
      // finish — `stages.start` runs and, needing no further stage, redirects.
      expect(pushMock).toHaveBeenCalledWith("/space/ws-1")
    })

    test("every candidate row carries a coexist switch, disabled until that number is selected", () => {
      // Two candidates, no coexist panel yet (nothing opted in).
      expect(switches()).toHaveLength(2)
      for (const rowSwitch of switches()) {
        expect(rowSwitch.getAttribute("aria-disabled")).toBe("true")
        expect(rowSwitch.getAttribute("aria-checked")).toBe("false")
      }

      const [, first] = checkboxes()
      click(first)

      expect(switches()[0]?.getAttribute("aria-disabled")).toBeNull()
      expect(switches()[1]?.getAttribute("aria-disabled")).toBe("true")
    })

    test("a single number whose sync-history switch is on posts the coexist route for the workspace the connect created", async () => {
      connectActionMock.mockImplementationOnce(
        async (input: MockedConnectActionInput = {}) =>
          connectedResult({
            phoneNumberId:
              (input.phoneNumberId as string | undefined) ?? PHONE_A.id,
            coexistEligible: true,
            integrationId: "int-a",
          }),
      )
      setCoexistWhatsappAPI.mockResolvedValue({ success: true })

      const [, first] = checkboxes()
      click(first)
      // Row A's own sync switch, then the AI switch it reveals under it.
      click(switches()[0])
      click(switches()[1])
      clickButtonByText("actions.connect")
      await flush()

      expect(setCoexistWhatsappAPI).toHaveBeenCalledTimes(1)
      expect(setCoexistWhatsappAPI).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        integrationId: "int-a",
        enabled: true,
        aiReadsSyncedHistory: true,
      })
      expect(pushMock).toHaveBeenCalledWith("/space/ws-1")
    })

    test("a coexist-eligible number whose switch stayed off posts nothing", async () => {
      connectActionMock.mockImplementationOnce(
        async (input: MockedConnectActionInput = {}) =>
          connectedResult({
            phoneNumberId:
              (input.phoneNumberId as string | undefined) ?? PHONE_A.id,
            coexistEligible: true,
            integrationId: "int-a",
          }),
      )

      const [, first] = checkboxes()
      click(first)
      clickButtonByText("actions.connect")
      await flush()

      expect(setCoexistWhatsappAPI).not.toHaveBeenCalled()
      expect(pushMock).toHaveBeenCalledWith("/space/ws-1")
    })

    test("in a batch, only the row whose switch is on gets a coexist call", async () => {
      connectActionMock.mockImplementation(
        (input: MockedConnectActionInput = {}) => {
          const phoneNumberId =
            (input.phoneNumberId as string | undefined) ?? PHONE_A.id
          return Promise.resolve(
            connectedResult({
              phoneNumberId,
              coexistEligible: true,
              integrationId: `int-${phoneNumberId}`,
            }),
          )
        },
      )
      setCoexistWhatsappAPI.mockResolvedValue({ success: true })

      const [selectAll] = checkboxes()
      click(selectAll)
      // Only the second number opts into syncing (switches are ordered by row).
      click(switches()[1])
      clickButtonByText("actions.connect")
      await flush()

      expect(connectActionMock).toHaveBeenCalledTimes(2)
      expect(setCoexistWhatsappAPI).toHaveBeenCalledTimes(1)
      expect(setCoexistWhatsappAPI.mock.calls[0]?.[0]).toMatchObject({
        workspaceId: "ws-1",
        integrationId: `int-${PHONE_B.id}`,
        enabled: true,
      })
    })

    test("two numbers connected in parallel from one session land on one workspace and one redirect", async () => {
      // The server side is what actually guarantees this: the first number's
      // transaction row-locks the session (`claimSignupSessionPhoneNumber`),
      // creates the workspace and binds it back
      // (`bindSignupSessionWorkspace`, one-shot), and the second number's
      // claim reads the bound value rather than the caller's stale null
      // (`resolveConnectWorkspace` trusts the CLAIMED row —
      // `whatsapp-integration.service.connect-phone.test.ts`). Here we pin
      // the client half: overlapping connects must not each redirect.
      connectActionMock.mockImplementation(
        (input: MockedConnectActionInput = {}) =>
          Promise.resolve(
            connectedResult({
              phoneNumberId:
                (input.phoneNumberId as string | undefined) ?? PHONE_A.id,
              workspaceId: "ws-shared",
            }),
          ),
      )

      const [selectAll] = checkboxes()
      click(selectAll)
      clickButtonByText("actions.connect")
      await flush()

      expect(connectActionMock).toHaveBeenCalledTimes(2)

      // The dialog portals into document.body, not this card's container.
      const dialogButton = (text: string) =>
        Array.from(document.body.querySelectorAll("button")).find((button) =>
          button.textContent?.includes(text),
        )

      // Walk the dialog to its end, whatever steps this outcome implies.
      for (let step = 0; step < 3 && pushMock.mock.calls.length === 0; step++) {
        const next =
          dialogButton("channels.connectMany.goToChannels") ??
          dialogButton("actions.continue")
        if (!next) {
          break
        }
        click(next)
        await flush()
      }

      expect(pushMock).toHaveBeenCalledTimes(1)
      expect(pushMock).toHaveBeenCalledWith("/space/ws-shared")
    })

    test("in a batch, each row carries its own AI-reads answer into its own POST", async () => {
      connectActionMock.mockImplementation(
        (input: MockedConnectActionInput = {}) => {
          const phoneNumberId =
            (input.phoneNumberId as string | undefined) ?? PHONE_A.id
          return Promise.resolve(
            connectedResult({
              phoneNumberId,
              coexistEligible: true,
              integrationId: `int-${phoneNumberId}`,
            }),
          )
        },
      )
      setCoexistWhatsappAPI.mockResolvedValue({ success: true })

      const [selectAll] = checkboxes()
      click(selectAll)
      // Both rows sync; only the first lets the AI read the synced history.
      click(switches()[0])
      click(switches()[2])
      // Row A now shows [sync, ai]; row B's sync switch follows them.
      click(switches()[1])

      clickButtonByText("actions.connect")
      await flush()

      expect(setCoexistWhatsappAPI).toHaveBeenCalledTimes(2)
      const bodyByIntegration = new Map(
        setCoexistWhatsappAPI.mock.calls.map((call) => {
          const body = call[0] as {
            integrationId: string
            aiReadsSyncedHistory: boolean
          }
          return [body.integrationId, body]
        }),
      )
      expect(
        bodyByIntegration.get(`int-${PHONE_A.id}`)?.aiReadsSyncedHistory,
      ).toBe(true)
      expect(
        bodyByIntegration.get(`int-${PHONE_B.id}`)?.aiReadsSyncedHistory,
      ).toBe(false)
    })

    test("selecting one number that needs verification shows the inline verification stage instead of redirecting", async () => {
      connectActionMock.mockImplementationOnce(
        async (input: MockedConnectActionInput = {}) =>
          connectedResult({
            phoneNumberId:
              (input.phoneNumberId as string | undefined) ?? PHONE_A.id,
            extra: { requiresPhoneVerification: true },
          }),
      )

      const [, first] = checkboxes()
      click(first)
      clickButtonByText("actions.connect")
      await flush()

      expect(connectActionMock).toHaveBeenCalledTimes(1)
      expect(pushMock).not.toHaveBeenCalled()
      // A single connect never renders `ConnectManyDialog`, so this title
      // can only come from the inline verification panel, never the
      // dialog's own extra-step label of the same name (N-6).
      expect(
        container().querySelector('[data-slot="connect-dialog-stepper"]'),
      ).toBeNull()
      expect(container().textContent).toContain(
        "whatsapp.phoneVerification.title",
      )
    })

    test("selecting two numbers opens the status dialog and connects them one at a time", async () => {
      let resolveFirst: (() => void) | undefined
      const callOrder: string[] = []

      connectActionMock.mockImplementation(
        (input: MockedConnectActionInput = {}) =>
          new Promise((resolve) => {
            const id = (input.phoneNumberId as string | undefined) ?? "unknown"
            callOrder.push(`start:${id}`)
            const settle = () => {
              callOrder.push(`end:${id}`)
              resolve(connectedResult({ phoneNumberId: id }))
            }
            if (id === PHONE_A.id) {
              resolveFirst = settle
            } else {
              settle()
            }
          }),
      )

      const [, first, second] = checkboxes()
      click(first)
      click(second)
      clickButtonByText("actions.connect")
      await flush()

      // WhatsApp is the one channel pinned to concurrency 1: every number in
      // a signup session shares one WABA, and the per-number connect also
      // runs WABA-level setup, so the second number must not start until the
      // first has finished.
      expect(callOrder).toEqual([`start:${PHONE_A.id}`])

      act(() => {
        resolveFirst?.()
      })
      await flush()

      expect(callOrder).toEqual([
        `start:${PHONE_A.id}`,
        `end:${PHONE_A.id}`,
        `start:${PHONE_B.id}`,
        `end:${PHONE_B.id}`,
      ])
    })
  })

  // A sibling of the picker suite above rather than a nested describe: that
  // suite's own `beforeEach` already relays a code and consumes the pending
  // selection, and a second relay in a nested hook would not re-trigger the
  // auto-connect.
  describe("multi-select phone number picker — a mode that cannot coexist", () => {
    /** Opens the picker in whatever mode the switches are left in. */
    const openPicker = async () => {
      connectActionMock.mockImplementationOnce(async () =>
        phoneNumberSelectionResult(),
      )
      relayCode()
      await flush()
    }

    test("a transfer signup offers no sync-history switch at all", async () => {
      // switches()[0] is connectExisting, [1] is transferPhoneNumber.
      click(switches()[1])
      await openPicker()

      expect(checkboxes()).toHaveLength(3)
      expect(switches()).toHaveLength(0)
      expect(container().textContent).not.toContain(
        "channels.connectMany.stepCoexist",
      )
    })

    test("a plain new-number signup offers none either", async () => {
      await openPicker()

      expect(checkboxes()).toHaveLength(3)
      expect(switches()).toHaveLength(0)
    })

    test("connect-existing does offer it — the gate is the mode, not the picker", async () => {
      click(switches()[0])
      await openPicker()

      expect(switches()).toHaveLength(2)
      expect(container().textContent).toContain(
        "channels.connectMany.stepCoexist",
      )
    })

    test("a number picked in a non-coexist mode fans out with coexist off", async () => {
      await openPicker()
      connectActionMock.mockImplementationOnce(
        async (input: MockedConnectActionInput = {}) =>
          connectedResult({
            phoneNumberId:
              (input.phoneNumberId as string | undefined) ?? PHONE_A.id,
            coexistEligible: true,
            integrationId: "int-a",
          }),
      )
      setCoexistWhatsappAPI.mockResolvedValue({ success: true })

      const [, first] = checkboxes()
      click(first)
      clickButtonByText("actions.connect")
      await flush()

      // Nothing could have opted in, so no coexist procedure is called.
      expect(setCoexistWhatsappAPI).not.toHaveBeenCalled()
    })
  })

  describe("multi-select phone number picker — an unpickable number", () => {
    beforeEach(async () => {
      click(switches()[0])
      // The connect action pre-filters connected numbers out today, so this
      // shape does not occur in production — the picker must still obey the
      // same "no switch on a row you cannot pick" rule as every other channel
      // if it ever does.
      connectActionMock.mockImplementationOnce(async () =>
        phoneNumberSelectionResult([
          {
            id: "phone-c",
            label: "Phone C",
            displayPhoneNumber: "+1 555 0003",
            disabled: true,
          },
        ]),
      )
      relayCode()
      await flush()
      connectActionMock.mockClear()
    })

    test("the unpickable number renders no coexist switch and select-all skips it", () => {
      expect(checkboxes()).toHaveLength(4)
      expect(switches()).toHaveLength(2)
      expect(switches().map((el) => el.getAttribute("aria-label"))).toEqual([
        `channels.connectMany.stepCoexist — ${PHONE_A.verified_name} (${PHONE_A.display_phone_number})`,
        `channels.connectMany.stepCoexist — ${PHONE_B.verified_name} (${PHONE_B.display_phone_number})`,
      ])

      const [selectAll, , , unpickable] = checkboxes()
      click(selectAll)
      expect(unpickable?.getAttribute("aria-checked")).toBe("false")
    })
  })
})
