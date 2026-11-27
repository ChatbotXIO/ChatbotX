import type { ChannelType } from "@chatbotx.io/utils/channel"
import { describe, expect, it } from "vitest"
import {
  MESSAGING_WINDOW_POLICY,
  resolveMessagingWindow,
} from "../src/lib/shared/messaging-window"

const H = 60 * 60 * 1000
const DAY = 24 * H
const last = new Date("2026-01-01T00:00:00Z")
const at = (ms: number) => last.getTime() + ms
const resolve = (
  channel: Parameters<typeof resolveMessagingWindow>[0]["channel"],
  ms: number,
) =>
  resolveMessagingWindow({
    channel,
    isDirect: true,
    lastIncomingMessageAt: last,
    now: at(ms),
  }).state

describe("resolveMessagingWindow", () => {
  it.each([
    "messenger",
    "instagram",
  ] as const)("%s: open ≤24h, humanAgent ≤7d, closed after", (channel) => {
    expect(resolve(channel, 0)).toBe("open")
    expect(resolve(channel, DAY)).toBe("open")
    expect(resolve(channel, DAY + 1)).toBe("humanAgent")
    expect(resolve(channel, 7 * DAY)).toBe("humanAgent")
    expect(resolve(channel, 7 * DAY + 1)).toBe("closed")
  })

  it("whatsapp: open ≤24h then closed", () => {
    expect(resolve("whatsapp", DAY)).toBe("open")
    expect(resolve("whatsapp", DAY + 1)).toBe("closed")
  })

  it("tiktok: open ≤48h then closed", () => {
    expect(resolve("tiktok", 2 * DAY)).toBe("open")
    expect(resolve("tiktok", 2 * DAY + 1)).toBe("closed")
  })

  it("returns unlimited for channels without a window", () => {
    for (const channel of Object.keys(
      MESSAGING_WINDOW_POLICY,
    ) as ChannelType[]) {
      if (MESSAGING_WINDOW_POLICY[channel] === null) {
        expect(resolve(channel, 100 * DAY)).toBe("unlimited")
      }
    }
  })

  it("returns notApplicable for comment conversations", () => {
    expect(
      resolveMessagingWindow({
        channel: "messenger",
        isDirect: false,
        lastIncomingMessageAt: last,
        now: at(100 * DAY),
      }).state,
    ).toBe("notApplicable")
  })

  it.each([null, undefined, "not-a-date"])("returns unknown for %s", (v) => {
    expect(
      resolveMessagingWindow({
        channel: "whatsapp",
        isDirect: true,
        lastIncomingMessageAt: v,
      }).state,
    ).toBe("unknown")
  })

  it("reports changesAt and closesAt", () => {
    const open = resolveMessagingWindow({
      channel: "messenger",
      isDirect: true,
      lastIncomingMessageAt: last,
      now: at(H),
    })
    expect(open.changesAt?.getTime()).toBe(at(DAY))
    expect(open.closesAt?.getTime()).toBe(at(7 * DAY))

    const wa = resolveMessagingWindow({
      channel: "whatsapp",
      isDirect: true,
      lastIncomingMessageAt: last.toISOString(),
      now: at(H),
    })
    expect(wa.changesAt?.getTime()).toBe(at(DAY))
    expect(wa.closesAt?.getTime()).toBe(at(DAY))

    const closed = resolveMessagingWindow({
      channel: "whatsapp",
      isDirect: true,
      lastIncomingMessageAt: last,
      now: at(2 * DAY),
    })
    expect(closed.changesAt).toBeNull()
    expect(closed.closesAt).toBeNull()
  })
})
