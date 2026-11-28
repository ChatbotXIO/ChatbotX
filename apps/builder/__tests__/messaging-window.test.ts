import { describe, expect, test } from "vitest"
import {
  CHANNEL_WINDOW_POLICY,
  formatCountdown,
  hasHumanAgentPhase,
  MESSENGER_HUMAN_AGENT_WINDOW_SECONDS,
  nextWindowBoundary,
  parseLastIncomingTs,
  resolveSendWindow,
} from "@/features/messages/lib/messaging-window"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const LAST = Date.parse("2026-06-10T00:00:00Z")

/**
 * The composer's send gate exactly as it was written inline in
 * message-input.tsx before the resolver existed. The table-driven resolver must
 * block in precisely the same cases, with the same notice.
 */
const legacyComposerGate = (
  channel: string | undefined,
  isDirect: boolean,
  lastIncomingTs: number | null,
  now: number,
): { blocked: boolean; reason: "standard" | "humanAgent" | null } => {
  const isMetaDm =
    (channel === "messenger" || channel === "instagram") && isDirect
  const humanAgentExpired =
    isMetaDm && lastIncomingTs !== null
      ? now - lastIncomingTs > MESSENGER_HUMAN_AGENT_WINDOW_SECONDS * 1000
      : false
  if (humanAgentExpired) {
    return { blocked: true, reason: "humanAgent" }
  }
  const directClosed =
    (channel === "whatsapp" || channel === "tiktok") && lastIncomingTs !== null
      ? now - lastIncomingTs > 24 * 60 * 60 * 1000
      : false
  return directClosed
    ? { blocked: true, reason: "standard" }
    : { blocked: false, reason: null }
}

const channels = [
  "api",
  "omnichannel",
  "webchat",
  "messenger",
  "whatsapp",
  "zalo",
  "smtp",
  "telegram",
  "line",
  "instagram",
  "threads",
  "tiktok",
  "not-a-channel",
  undefined,
]
const offsets = [
  -HOUR_MS,
  0,
  DAY_MS - 1,
  DAY_MS,
  DAY_MS + 1,
  7 * DAY_MS - 1,
  7 * DAY_MS,
  7 * DAY_MS + 1,
  30 * DAY_MS,
]

describe("resolveSendWindow parity with the old composer gate", () => {
  test("closed <=> blocked, with the same reason, for channel x isDirect x instant", () => {
    for (const channel of channels) {
      for (const isDirect of [true, false]) {
        for (const lastIncomingTs of [LAST, null]) {
          for (const offset of offsets) {
            const now = LAST + offset
            const legacy = legacyComposerGate(
              channel,
              isDirect,
              lastIncomingTs,
              now,
            )
            const state = resolveSendWindow({
              channel,
              isDirect,
              lastIncomingTs,
              now,
            })
            const label = `${channel} direct=${isDirect} last=${lastIncomingTs} +${offset}`
            expect(state.kind === "closed", label).toBe(legacy.blocked)
            if (state.kind === "closed") {
              expect(state.reason, label).toBe(legacy.reason)
            }
          }
        }
      }
    }
  })

  test("every policy ends in a blocking phase with ascending lengths", () => {
    for (const policy of Object.values(CHANNEL_WINDOW_POLICY)) {
      expect(policy.phases.at(-1)?.blocksSendAfter).toBe(true)
      const lengths = policy.phases.map((phase) => phase.seconds)
      expect(lengths).toEqual([...lengths].sort((a, b) => a - b))
    }
  })
})

describe("resolveSendWindow states", () => {
  const dm = { channel: "instagram", isDirect: true, lastIncomingTs: LAST }

  test("standard phase then human-agent phase for a Meta DM", () => {
    expect(resolveSendWindow({ ...dm, now: LAST + DAY_MS - 5000 })).toEqual({
      kind: "open",
      phase: "standard",
      remainingMs: 5000,
    })
    expect(resolveSendWindow({ ...dm, now: LAST + DAY_MS })).toEqual({
      kind: "open",
      phase: "standard",
      remainingMs: 0,
    })
    expect(resolveSendWindow({ ...dm, now: LAST + DAY_MS + 1 })).toEqual({
      kind: "open",
      phase: "humanAgent",
      remainingMs: 6 * DAY_MS - 1,
    })
    expect(resolveSendWindow({ ...dm, now: LAST + 7 * DAY_MS })).toEqual({
      kind: "open",
      phase: "humanAgent",
      remainingMs: 0,
    })
    expect(resolveSendWindow({ ...dm, now: LAST + 7 * DAY_MS + 1 })).toEqual({
      kind: "closed",
      reason: "humanAgent",
    })
  })

  test("whatsapp closes at 24h with the standard reason", () => {
    const wa = { channel: "whatsapp", isDirect: true, lastIncomingTs: LAST }
    expect(resolveSendWindow({ ...wa, now: LAST + DAY_MS }).kind).toBe("open")
    expect(resolveSendWindow({ ...wa, now: LAST + DAY_MS + 1 })).toEqual({
      kind: "closed",
      reason: "standard",
    })
  })

  test("comment conversations of Meta channels are not applicable", () => {
    expect(
      resolveSendWindow({ ...dm, isDirect: false, now: LAST + 30 * DAY_MS }),
    ).toEqual({ kind: "notApplicable" })
    expect(
      resolveSendWindow({
        channel: "messenger",
        isDirect: false,
        lastIncomingTs: LAST,
        now: LAST,
      }),
    ).toEqual({ kind: "notApplicable" })
  })

  test("whatsapp applies even when not a direct conversation", () => {
    expect(
      resolveSendWindow({
        channel: "whatsapp",
        isDirect: false,
        lastIncomingTs: LAST,
        now: LAST,
      }).kind,
    ).toBe("open")
  })

  test("unknown channel and channel without a window are not applicable", () => {
    for (const channel of ["telegram", "bogus", undefined, null]) {
      expect(
        resolveSendWindow({
          channel,
          isDirect: true,
          lastIncomingTs: LAST,
          now: LAST,
        }),
      ).toEqual({ kind: "notApplicable" })
    }
  })

  test("unknown when the contact never wrote in", () => {
    expect(
      resolveSendWindow({ ...dm, lastIncomingTs: null, now: LAST }),
    ).toEqual({ kind: "unknown" })
  })
})

describe("nextWindowBoundary", () => {
  const dm = { channel: "instagram", isDirect: true, lastIncomingTs: LAST }

  test("walks the phase ends of the same table", () => {
    expect(nextWindowBoundary({ ...dm, now: LAST + HOUR_MS })).toBe(
      LAST + DAY_MS,
    )
    expect(nextWindowBoundary({ ...dm, now: LAST + DAY_MS })).toBe(
      LAST + 7 * DAY_MS,
    )
    expect(nextWindowBoundary({ ...dm, now: LAST + 7 * DAY_MS })).toBeNull()
  })

  test("null without a last-incoming, a window, or for comment conversations", () => {
    expect(
      nextWindowBoundary({ ...dm, lastIncomingTs: null, now: LAST }),
    ).toBeNull()
    expect(
      nextWindowBoundary({ ...dm, channel: undefined, now: LAST }),
    ).toBeNull()
    expect(
      nextWindowBoundary({ ...dm, channel: "telegram", now: LAST }),
    ).toBeNull()
    expect(nextWindowBoundary({ ...dm, isDirect: false, now: LAST })).toBeNull()
  })
})

describe("hasHumanAgentPhase", () => {
  test("is table-derived", () => {
    expect(hasHumanAgentPhase("instagram")).toBe(true)
    expect(hasHumanAgentPhase("messenger")).toBe(true)
    expect(hasHumanAgentPhase("whatsapp")).toBe(false)
    expect(hasHumanAgentPhase(undefined)).toBe(false)
  })
})

describe("parseLastIncomingTs", () => {
  test("parses dates and ISO strings, rejects absent or invalid values", () => {
    expect(parseLastIncomingTs(new Date(LAST))).toBe(LAST)
    expect(parseLastIncomingTs("2026-06-10T00:00:00Z")).toBe(LAST)
    expect(parseLastIncomingTs(null)).toBeNull()
    expect(parseLastIncomingTs(undefined)).toBeNull()
    expect(parseLastIncomingTs("garbage")).toBeNull()
  })
})

describe("formatCountdown", () => {
  test("formats hh:mm:ss and clamps negatives", () => {
    expect(formatCountdown(0)).toBe("00:00:00")
    expect(formatCountdown(999)).toBe("00:00:00")
    expect(formatCountdown(DAY_MS)).toBe("24:00:00")
    expect(formatCountdown(3 * HOUR_MS + 4 * 60_000 + 5000)).toBe("03:04:05")
    expect(formatCountdown(-5000)).toBe("00:00:00")
  })
})
