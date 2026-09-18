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
    onAnswer: (id: string) => void
    onReject: (id: string) => void
  }) =>
    act(() => {
      root.render(<WhatsappRingingCallsList {...props} />)
    })

  test("renders nothing when the basket is empty", () => {
    render({ calls: [], onAnswer: vi.fn(), onReject: vi.fn() })

    expect(container.textContent).toBe("")
  })

  test("renders one row per caller with the title showing the count", () => {
    render({
      calls: [ringA, ringB],
      onAnswer: vi.fn(),
      onReject: vi.fn(),
    })

    expect(container.textContent).toContain("Ada Lovelace")
    expect(container.textContent).toContain("Grace Hopper")
    expect(container.textContent).toContain(
      `whatsapp.calls.panel.ringingListTitle:${JSON.stringify({ count: 2 })}`,
    )
    expect(
      container.querySelectorAll('[aria-label^="whatsapp.calls.answerCaller"]'),
    ).toHaveLength(2)
    expect(
      container.querySelectorAll('[aria-label^="whatsapp.calls.rejectCaller"]'),
    ).toHaveLength(2)
  })

  // This component must render no backdrop of its own. Nested inside the
  // caller's positioned `z-50` wrapper, a viewport-wide `fixed z-40` overlay
  // paints OVER this un-positioned card and, having no `pointer-events-none`,
  // swallows every Answer/Reject click in exactly the two-simultaneous-rings
  // scenario the component exists for. The backdrop is
  // the caller's sibling now; owning one here again would bring the bug back.
  test("renders NO backdrop of its own — the caller owns that, as its sibling", () => {
    render({ calls: [ringA, ringB], onAnswer: vi.fn(), onReject: vi.fn() })

    expect(
      container.querySelector('[aria-hidden="true"].fixed.inset-0'),
    ).toBeNull()
  })

  test("renders no fixed positioning of its own, so it cannot create a stacking context for a caller's overlay", () => {
    render({ calls: [ringA, ringB], onAnswer: vi.fn(), onReject: vi.fn() })

    const card = container.querySelector(
      '[data-testid="whatsapp-ringing-calls-list"]',
    )
    expect(card?.className).not.toContain("fixed")
  })

  test("each row's Answer/Reject buttons target that row's own id", () => {
    const onAnswer = vi.fn()
    const onReject = vi.fn()
    render({ calls: [ringA, ringB], onAnswer, onReject })

    const answerButtons = container.querySelectorAll(
      '[aria-label^="whatsapp.calls.answerCaller"]',
    )
    act(() => {
      answerButtons[1]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })
    expect(onAnswer).toHaveBeenCalledWith("ring-b")

    const rejectButtons = container.querySelectorAll(
      '[aria-label^="whatsapp.calls.rejectCaller"]',
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
      onAnswer: vi.fn(),
      onReject: vi.fn(),
    })

    expect(container.textContent).toContain("whatsapp.calls.unknownCaller")
  })
})
