// @vitest-environment jsdom

/**
 * C3/C4/C9: the send-window boundaries (24 h and 7 d) through the pure
 * resolver and through the contact-panel row with fake timers, for the Meta
 * DM channels (instagram, messenger) and the single-phase channels
 * (whatsapp, tiktok).
 */

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { resolveSendWindow } from "@/features/messages/lib/messaging-window"

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
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const NOW = Date.parse("2026-06-10T12:00:00Z")
const OPEN = "fields.channelProfile.messagingWindow.open"
const HUMAN = "fields.channelProfile.messagingWindow.humanAgentOpen"
const CLOSED = "fields.channelProfile.messagingWindow.closed"

describe("resolveSendWindow at the exact boundaries", () => {
  const at = (channel: string, elapsed: number) =>
    resolveSendWindow({
      channel,
      isDirect: true,
      lastIncomingTs: NOW - elapsed,
      now: NOW,
    })

  test.each([
    "instagram",
    "messenger",
  ])("%s DM: 24h-1ms / 24h / 24h+1ms / 7d-1ms / 7d / 7d+1ms", (channel) => {
    expect(at(channel, DAY_MS - 1)).toEqual({
      kind: "open",
      phase: "standard",
      remainingMs: 1,
    })
    expect(at(channel, DAY_MS)).toEqual({
      kind: "open",
      phase: "standard",
      remainingMs: 0,
    })
    expect(at(channel, DAY_MS + 1)).toEqual({
      kind: "open",
      phase: "humanAgent",
      remainingMs: WEEK_MS - DAY_MS - 1,
    })
    expect(at(channel, WEEK_MS - 1)).toEqual({
      kind: "open",
      phase: "humanAgent",
      remainingMs: 1,
    })
    expect(at(channel, WEEK_MS)).toEqual({
      kind: "open",
      phase: "humanAgent",
      remainingMs: 0,
    })
    expect(at(channel, WEEK_MS + 1)).toEqual({
      kind: "closed",
      reason: "humanAgent",
    })
  })

  test.each([
    "whatsapp",
    "tiktok",
  ])("%s: open through 24h, closed at 24h+1ms, never a human-agent phase", (channel) => {
    expect(at(channel, DAY_MS - 1)).toMatchObject({
      kind: "open",
      remainingMs: 1,
    })
    expect(at(channel, DAY_MS)).toMatchObject({ kind: "open", remainingMs: 0 })
    expect(at(channel, DAY_MS + 1)).toEqual({
      kind: "closed",
      reason: "standard",
    })
    expect(at(channel, WEEK_MS)).toEqual({ kind: "closed", reason: "standard" })
  })

  test("a last incoming message from the future is open with more than the window left", () => {
    expect(at("whatsapp", -HOUR_MS)).toMatchObject({
      kind: "open",
      remainingMs: DAY_MS + HOUR_MS,
    })
  })
})

describe("MessagingWindowRow around the boundaries (fake timers)", () => {
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
  })

  const render = (channel: string, boundaryInMs: number, length: number) =>
    act(() =>
      root.render(
        <MessagingWindowRow
          channel={channel}
          isDirect
          lastIncomingMessageAt={new Date(NOW + boundaryInMs - length)}
        />,
      ),
    )
  const text = () =>
    container.querySelector("[data-state]")?.textContent ?? null
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })

  describe.each([
    ["instagram", DAY_MS, `${HUMAN}|143:59:59`],
    ["messenger", DAY_MS, `${HUMAN}|143:59:59`],
  ])("%s DM at the 24h boundary", (channel, length, afterBoundary) => {
    test("the boundary tick keeps the last standard second, the next tick enters human-agent", () => {
      // Boundary lands exactly on the first 1 s tick after mount.
      render(channel, 1000, length)
      expect(text()).toBe(`${OPEN}|00:00:01`)

      advance(999)
      expect(text()).toBe(`${OPEN}|00:00:01`)

      advance(1) // exactly 24h after the last message
      expect(text()).toBe(`${OPEN}|00:00:00`)

      advance(1000) // 24h + 1s
      expect(text()).toBe(afterBoundary)
    })
  })

  describe.each(["whatsapp", "tiktok"])("%s at the 24h boundary", (channel) => {
    test("open 00:00:00 exactly at 24h, closed on the next tick, interval cleared", () => {
      render(channel, 1000, DAY_MS)

      advance(1000)
      expect(text()).toBe(`${OPEN}|00:00:00`)
      // The 1 s interval plus the boundary timeout, which fires 1ms later.
      expect(vi.getTimerCount()).toBe(2)

      advance(1)
      expect(text()).toBe(CLOSED)
      expect(vi.getTimerCount()).toBe(0)

      advance(5000)
      expect(text()).toBe(CLOSED)
    })
  })

  test.each([
    "instagram",
    "messenger",
  ])("%s DM at the 7d boundary: open 00:00:00 at 7d, closed 1s later, then no timer", (channel) => {
    render(channel, 1000, WEEK_MS)
    expect(text()).toBe(`${HUMAN}|00:00:01`)

    advance(999)
    expect(text()).toBe(`${HUMAN}|00:00:01`)
    advance(1)
    expect(text()).toBe(`${HUMAN}|00:00:00`)
    // C9: the boundary timeout re-renders 1ms later, without waiting for the tick.
    advance(1)
    expect(text()).toBe(CLOSED)
    expect(vi.getTimerCount()).toBe(0)
  })

  test.each([
    "whatsapp",
    "tiktok",
    "instagram",
  ])("%s: a mount 1ms before / on / 1ms after the final boundary", (channel) => {
    const final = channel === "instagram" ? WEEK_MS : DAY_MS
    const phaseOpen = channel === "instagram" ? HUMAN : OPEN
    const cases: [number, string][] = [
      [1, `${phaseOpen}|00:00:00`],
      [0, `${phaseOpen}|00:00:00`],
      [-1, CLOSED],
    ]
    for (const [boundaryInMs, expected] of cases) {
      act(() => root.unmount())
      root = createRoot(container)
      render(channel, boundaryInMs, final)
      expect(text()).toBe(expected)
    }
  })

  // C9: a timeout at the final boundary re-renders the row 1ms after it, so it
  // never keeps showing "open 00:00:00" until the next 1 s tick.
  test("the row reads closed 1ms after the final boundary without waiting for the next 1s tick", () => {
    render("whatsapp", 1000, DAY_MS)
    advance(1000)
    advance(1)
    expect(text()).toBe(CLOSED)
  })
})
