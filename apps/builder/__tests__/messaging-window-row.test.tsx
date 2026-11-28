import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const translate = (key: string, values?: { time?: string }) =>
  values?.time ? `${key}|${values.time}` : key
vi.mock("next-intl", () => ({ useTranslations: () => translate }))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render }: { render: React.ReactElement }) => render,
  TooltipContent: () => null,
}))

const { MessagingWindowRow } = await import(
  "@/features/contacts/components/messaging-window-row"
)

const HOUR_MS = 60 * 60 * 1000
const NOW = Date.parse("2026-06-10T12:00:00Z")

describe("MessagingWindowRow", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const render = (props: {
    channel: string
    isDirect?: boolean
    lastIncomingMessageAt: Date | null
  }) => act(() => root.render(<MessagingWindowRow isDirect {...props} />))
  const valueText = () =>
    container.querySelector("[data-state]")?.textContent ?? null

  test("shows a ticking countdown while open", () => {
    render({
      channel: "instagram",
      lastIncomingMessageAt: new Date(NOW - 23 * HOUR_MS),
    })
    expect(valueText()).toBe(
      "fields.channelProfile.messagingWindow.open|01:00:00",
    )
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(valueText()).toBe(
      "fields.channelProfile.messagingWindow.open|00:59:57",
    )
  })

  test("a Meta DM moves from the standard to the human-agent phase, then closes", () => {
    render({
      channel: "instagram",
      lastIncomingMessageAt: new Date(NOW - 24 * HOUR_MS + 2000),
    })
    expect(valueText()).toBe(
      "fields.channelProfile.messagingWindow.open|00:00:02",
    )
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(valueText()).toBe(
      "fields.channelProfile.messagingWindow.humanAgentOpen|143:59:59",
    )
    // Keeps ticking through the whole human-agent phase.
    expect(vi.getTimerCount()).toBe(1)
    act(() => {
      vi.advanceTimersByTime(7 * 24 * HOUR_MS)
    })
    expect(valueText()).toBe("fields.channelProfile.messagingWindow.closed")
    expect(vi.getTimerCount()).toBe(0)
  })

  test("whatsapp closes at the end of its single standard phase", () => {
    render({
      channel: "whatsapp",
      lastIncomingMessageAt: new Date(NOW - 24 * HOUR_MS + 2000),
    })
    expect(vi.getTimerCount()).toBe(1)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(valueText()).toBe("fields.channelProfile.messagingWindow.closed")
    expect(vi.getTimerCount()).toBe(0)
  })

  test("a post-comment conversation of a Meta channel renders nothing", () => {
    render({
      channel: "instagram",
      isDirect: false,
      lastIncomingMessageAt: new Date(NOW - HOUR_MS),
    })
    expect(container.innerHTML).toBe("")
    expect(vi.getTimerCount()).toBe(0)
  })

  test("renders closed without starting any timer", () => {
    render({
      channel: "instagram",
      lastIncomingMessageAt: new Date(NOW - 8 * 24 * HOUR_MS),
    })
    expect(valueText()).toBe("fields.channelProfile.messagingWindow.closed")
    expect(vi.getTimerCount()).toBe(0)
  })

  test("shows a dash when the contact never wrote in", () => {
    render({ channel: "instagram", lastIncomingMessageAt: null })
    expect(valueText()).toBe("—")
    expect(vi.getTimerCount()).toBe(0)
  })

  test("renders nothing for a channel without a window", () => {
    render({ channel: "telegram", lastIncomingMessageAt: new Date(NOW) })
    expect(container.innerHTML).toBe("")
    expect(vi.getTimerCount()).toBe(0)
  })

  test("clears its interval and listener on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener")
    render({
      channel: "instagram",
      lastIncomingMessageAt: new Date(NOW - HOUR_MS),
    })
    expect(vi.getTimerCount()).toBe(1)
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    expect(removeSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    )
    // re-create so afterEach unmount stays valid
    root = createRoot(container)
  })

  test("pauses the interval while the document is hidden", () => {
    render({
      channel: "instagram",
      lastIncomingMessageAt: new Date(NOW - HOUR_MS),
    })
    expect(vi.getTimerCount()).toBe(1)
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(vi.getTimerCount()).toBe(0)
    visibility.mockReturnValue("visible")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(vi.getTimerCount()).toBe(1)
  })

  test("restarts counting when a new incoming message arrives while closed", () => {
    render({
      channel: "instagram",
      lastIncomingMessageAt: new Date(NOW - 8 * 24 * HOUR_MS),
    })
    expect(valueText()).toBe("fields.channelProfile.messagingWindow.closed")
    render({ channel: "instagram", lastIncomingMessageAt: new Date(NOW) })
    expect(valueText()).toBe(
      "fields.channelProfile.messagingWindow.open|24:00:00",
    )
    expect(vi.getTimerCount()).toBe(1)
  })
})
