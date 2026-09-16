import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { WhatsappVoipRingingCall } from "@/features/integration-whatsapp/calling/voip/voip-call-store"
import { WhatsappRingingCallsList } from "@/features/integration-whatsapp/calling/voip/whatsapp-ringing-calls-list"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

const ringA: WhatsappVoipRingingCall = {
  whatsappCallId: "ring-a",
  wacid: "wacid-a",
  conversationId: "conversation-a",
  contactInboxId: "contact-inbox-a",
  contactName: "Ada Lovelace",
  offer: { sdpType: "offer", sdp: "v=0" },
  deadlineAt: new Date(Date.now() + 30_000).toISOString(),
}

const ringB: WhatsappVoipRingingCall = {
  ...ringA,
  whatsappCallId: "ring-b",
  contactName: "Grace Hopper",
}

describe("WhatsappRingingCallsList", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (props: {
    calls: WhatsappVoipRingingCall[]
    engaged: boolean
    onAnswer: (id: string) => void
    onReject: (id: string) => void
  }) =>
    act(() => {
      root.render(<WhatsappRingingCallsList {...props} />)
    })

  test("renders nothing when the basket is empty", () => {
    render({ calls: [], engaged: false, onAnswer: vi.fn(), onReject: vi.fn() })

    expect(container.textContent).toBe("")
  })

  test("renders one row per caller with the title showing the count", () => {
    render({
      calls: [ringA, ringB],
      engaged: false,
      onAnswer: vi.fn(),
      onReject: vi.fn(),
    })

    expect(container.textContent).toContain("Ada Lovelace")
    expect(container.textContent).toContain("Grace Hopper")
    expect(container.textContent).toContain(
      `whatsapp.calls.panel.ringingListTitle:${JSON.stringify({ count: 2 })}`,
    )
    expect(
      container.querySelectorAll(`[aria-label="whatsapp.calls.answer"]`),
    ).toHaveLength(2)
    expect(
      container.querySelectorAll(`[aria-label="whatsapp.calls.reject"]`),
    ).toHaveLength(2)
  })

  test("shows a backdrop when NOT engaged (free-slot 2+ rings case)", () => {
    render({
      calls: [ringA, ringB],
      engaged: false,
      onAnswer: vi.fn(),
      onReject: vi.fn(),
    })

    expect(
      container.querySelector('[aria-hidden="true"].fixed.inset-0'),
    ).not.toBeNull()
  })

  test("shows NO backdrop when engaged (compact strip above the busy call panel)", () => {
    render({
      calls: [ringA, ringB],
      engaged: true,
      onAnswer: vi.fn(),
      onReject: vi.fn(),
    })

    expect(
      container.querySelector('[aria-hidden="true"].fixed.inset-0'),
    ).toBeNull()
  })

  test("each row's Answer/Reject buttons target that row's own id", () => {
    const onAnswer = vi.fn()
    const onReject = vi.fn()
    render({ calls: [ringA, ringB], engaged: false, onAnswer, onReject })

    const answerButtons = container.querySelectorAll(
      `[aria-label="whatsapp.calls.answer"]`,
    )
    act(() => {
      answerButtons[1]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })
    expect(onAnswer).toHaveBeenCalledWith("ring-b")

    const rejectButtons = container.querySelectorAll(
      `[aria-label="whatsapp.calls.reject"]`,
    )
    act(() => {
      rejectButtons[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })
    expect(onReject).toHaveBeenCalledWith("ring-a")
  })

  test("falls back to the unknown-caller label when contactName is missing", () => {
    render({
      calls: [{ ...ringA, contactName: null }],
      engaged: false,
      onAnswer: vi.fn(),
      onReject: vi.fn(),
    })

    expect(container.textContent).toContain("whatsapp.calls.unknownCaller")
  })
})
