import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WhatsappCallDock } from "@/features/integration-whatsapp/calling/softphone/call-dock"
import { useWhatsappCallStore } from "@/features/integration-whatsapp/calling/softphone/call-store"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

const { hangupActionMock } = vi.hoisted(() => ({
  hangupActionMock: vi.fn().mockResolvedValue(undefined),
}))
vi.mock(
  "@/features/integration-whatsapp/calling/actions/hangup-call.action",
  () => ({ hangupWhatsappCallAction: hangupActionMock }),
)

const sipUserMock = {
  answer: vi.fn().mockResolvedValue(undefined),
  decline: vi.fn().mockResolvedValue(undefined),
  hangup: vi.fn().mockResolvedValue(undefined),
  setMuted: vi.fn(),
  isMuted: false,
  isRegistered: true,
  call: vi.fn().mockResolvedValue(undefined),
}
vi.mock(
  "@/features/integration-whatsapp/calling/softphone/sip-user-provider",
  () => ({ useSipUserContext: () => sipUserMock }),
)

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

describe("WhatsappCallDock", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useWhatsappCallStore.setState({
      incoming: {},
      active: null,
      outgoing: null,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = () =>
    act(() => {
      root.render(<WhatsappCallDock />)
    })

  test("renders nothing when there is no call activity", async () => {
    await render()
    expect(container.textContent).toBe("")
  })

  test("shows the incoming-call card with answer/decline actions", async () => {
    useWhatsappCallStore.getState().enrichIncoming({
      rootUuid: "root-1",
      contactName: "Ada Lovelace",
    })
    await render()
    expect(container.textContent).toContain("Ada Lovelace")
    expect(container.textContent).toContain("whatsapp.calls.incomingCall")
  })

  test("shows the active-call card with a timer and hangup", async () => {
    useWhatsappCallStore.getState().setActiveCall({
      rootUuid: "root-1",
      callId: "call-1",
      contactName: "Ada Lovelace",
      startedAt: Date.now(),
    })
    await render()
    expect(container.textContent).toContain("Ada Lovelace")
    expect(container.textContent).toContain("0:00")
  })

  test("answering the incoming call passes its rootUuid to the SIP context", async () => {
    useWhatsappCallStore.getState().enrichIncoming({
      rootUuid: "root-1",
      contactName: "Ada Lovelace",
    })
    await render()
    const answerButton = container.querySelectorAll("button")[0]
    await act(() => {
      answerButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(sipUserMock.answer).toHaveBeenCalledWith("root-1")
  })

  test("shows the outgoing dialing card", async () => {
    useWhatsappCallStore.getState().setOutgoingCall({
      attemptId: "att-1",
      callId: "call-1",
      contactName: "Ada Lovelace",
    })
    await render()
    expect(container.textContent).toContain("whatsapp.calls.dialing")
  })
})
