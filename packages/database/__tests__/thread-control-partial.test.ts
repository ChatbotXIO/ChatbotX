import { describe, expect, test } from "vitest"
import {
  eventsOutrankedBy,
  isInboxThreadControlActive,
  isServiceSendBlocked,
  parseThreadControlRole,
  readThreadControlColumns,
  resolveThreadControlState,
  THREAD_CONTROL_EVENT_PRECEDENCE,
  THREAD_CONTROL_INBOX_ACTIVE_MS,
  THREAD_CONTROL_TRANSITIONS,
  THREAD_IDLE_AFTER_MS,
  type ThreadControlEvent,
  type ThreadControlState,
  threadControlEvents,
  toThreadControlTimestamp,
} from "../src/partials/thread-control"

const NOW = new Date("2026-09-29T12:00:00.000Z")
const ago = (ms: number): Date => new Date(NOW.getTime() - ms)

describe("THREAD_CONTROL_TRANSITIONS", () => {
  const expected: Record<ThreadControlEvent, ThreadControlState> = {
    inboundReceived: "owned",
    controlPassed: "owned",
    taken: "owned",
    serviceSent: "owned",
    standbyReceived: "standby",
    controlTaken: "standby",
    passed: "standby",
    serviceRejected: "standby",
    released: "idle",
  }

  test.each(Object.entries(expected))("%s resolves to %s", (event, state) => {
    expect(THREAD_CONTROL_TRANSITIONS[event as ThreadControlEvent]).toBe(state)
  })

  test("covers every event exactly once", () => {
    expect(Object.keys(THREAD_CONTROL_TRANSITIONS).sort()).toEqual(
      [...threadControlEvents.options].sort(),
    )
  })
})

describe("THREAD_CONTROL_EVENT_PRECEDENCE", () => {
  test("is a total order over every event with no duplicates", () => {
    expect([...THREAD_CONTROL_EVENT_PRECEDENCE].sort()).toEqual(
      [...threadControlEvents.options].sort(),
    )
    expect(new Set(THREAD_CONTROL_EVENT_PRECEDENCE).size).toBe(
      THREAD_CONTROL_EVENT_PRECEDENCE.length,
    )
  })

  test("Meta explicit handovers outrank our calls which outrank inferred states", () => {
    const rank = (event: ThreadControlEvent) =>
      THREAD_CONTROL_EVENT_PRECEDENCE.indexOf(event)
    expect(rank("controlTaken")).toBeGreaterThan(rank("taken"))
    expect(rank("controlPassed")).toBeGreaterThan(rank("taken"))
    expect(rank("taken")).toBeGreaterThan(rank("serviceSent"))
    expect(rank("passed")).toBeGreaterThan(rank("inboundReceived"))
  })
})

describe("eventsOutrankedBy", () => {
  test("the lowest-precedence event outranks nothing", () => {
    expect(eventsOutrankedBy("inboundReceived")).toEqual([])
  })

  test("the highest-precedence event outranks every other event", () => {
    expect(eventsOutrankedBy("controlTaken").sort()).toEqual(
      threadControlEvents.options.filter((e) => e !== "controlTaken").sort(),
    )
  })

  test("never includes the event itself and only strictly lower events", () => {
    for (const event of threadControlEvents.options) {
      const outranked = eventsOutrankedBy(event)
      expect(outranked).not.toContain(event)
      const rank = THREAD_CONTROL_EVENT_PRECEDENCE.indexOf(event)
      for (const loser of outranked) {
        expect(THREAD_CONTROL_EVENT_PRECEDENCE.indexOf(loser)).toBeLessThan(
          rank,
        )
      }
    }
  })

  test("two distinct events can never both outrank each other", () => {
    for (const a of threadControlEvents.options) {
      for (const b of threadControlEvents.options) {
        if (a === b) {
          continue
        }
        const aBeatsB = eventsOutrankedBy(a).includes(b)
        const bBeatsA = eventsOutrankedBy(b).includes(a)
        expect(aBeatsB !== bBeatsA).toBe(true)
      }
    }
  })
})

describe("resolveThreadControlState", () => {
  test("null state means routing was never observed", () => {
    expect(
      resolveThreadControlState({
        state: null,
        lastIncomingMessageAt: ago(1000),
        threadControlUpdatedAt: null,
        now: NOW,
      }),
    ).toBeNull()
  })

  test.each([
    "owned",
    "standby",
  ] as const)("%s within 24h stays %s", (state) => {
    expect(
      resolveThreadControlState({
        state,
        lastIncomingMessageAt: ago(THREAD_IDLE_AFTER_MS - 1),
        threadControlUpdatedAt: null,
        now: NOW,
      }),
    ).toBe(state)
  })

  test.each([
    "owned",
    "standby",
  ] as const)("%s at exactly 24h is idle", (state) => {
    expect(
      resolveThreadControlState({
        state,
        lastIncomingMessageAt: ago(THREAD_IDLE_AFTER_MS),
        threadControlUpdatedAt: null,
        now: NOW,
      }),
    ).toBe("idle")
  })

  test("a stored state older than 24h of user silence is idle", () => {
    expect(
      resolveThreadControlState({
        state: "standby",
        lastIncomingMessageAt: ago(THREAD_IDLE_AFTER_MS + 60_000),
        threadControlUpdatedAt: null,
        now: NOW,
      }),
    ).toBe("idle")
  })

  test("idle stays idle", () => {
    expect(
      resolveThreadControlState({
        state: "idle",
        lastIncomingMessageAt: ago(1000),
        threadControlUpdatedAt: null,
        now: NOW,
      }),
    ).toBe("idle")
  })

  test("without any reference timestamp the stored state is kept", () => {
    expect(
      resolveThreadControlState({
        state: "owned",
        lastIncomingMessageAt: null,
        threadControlUpdatedAt: null,
        now: NOW,
      }),
    ).toBe("owned")
  })
})

describe("resolveThreadControlState measured from the last transition", () => {
  const oldIncoming = ago(3 * THREAD_IDLE_AFTER_MS)

  test.each([
    ["standby", "controlTaken"],
    ["owned", "controlPassed"],
  ] as const)("%s after %s stays until updatedAt + 24h despite an old user message", (state) => {
    const resolve = (updatedAgoMs: number) =>
      resolveThreadControlState({
        state,
        lastIncomingMessageAt: oldIncoming,
        threadControlUpdatedAt: ago(updatedAgoMs),
        now: NOW,
      })
    expect(resolve(0)).toBe(state)
    expect(resolve(THREAD_IDLE_AFTER_MS - 1)).toBe(state)
    expect(resolve(THREAD_IDLE_AFTER_MS)).toBe("idle")
  })

  test("a newer user message extends the window past the transition", () => {
    expect(
      resolveThreadControlState({
        state: "standby",
        lastIncomingMessageAt: ago(1000),
        threadControlUpdatedAt: ago(2 * THREAD_IDLE_AFTER_MS),
        now: NOW,
      }),
    ).toBe("standby")
  })

  test("an old user message without a transition time is idle; both null keeps state", () => {
    expect(
      resolveThreadControlState({
        state: "owned",
        lastIncomingMessageAt: oldIncoming,
        threadControlUpdatedAt: null,
        now: NOW,
      }),
    ).toBe("idle")
    expect(
      resolveThreadControlState({
        state: "owned",
        lastIncomingMessageAt: null,
        threadControlUpdatedAt: null,
        now: NOW,
      }),
    ).toBe("owned")
  })

  test("the send gate stays closed for a fresh controlTaken on an old thread", () => {
    expect(
      isServiceSendBlocked({
        state: "standby",
        lastIncomingMessageAt: oldIncoming,
        threadControlUpdatedAt: ago(1000),
        isTemplateMessage: false,
        now: NOW,
      }),
    ).toBe(true)
  })
})

describe("isServiceSendBlocked", () => {
  const base = {
    lastIncomingMessageAt: ago(1000),
    threadControlUpdatedAt: null,
    now: NOW,
  }

  test("blocks a Service send while another responder holds the thread", () => {
    expect(
      isServiceSendBlocked({
        ...base,
        state: "standby",
        isTemplateMessage: false,
      }),
    ).toBe(true)
  })

  test("never blocks a template, even on a standby thread", () => {
    expect(
      isServiceSendBlocked({
        ...base,
        state: "standby",
        isTemplateMessage: true,
      }),
    ).toBe(false)
  })

  test.each([
    "owned",
    "idle",
    null,
  ] as const)("does not block on %s", (state) => {
    expect(
      isServiceSendBlocked({ ...base, state, isTemplateMessage: false }),
    ).toBe(false)
  })

  test("does not block once the standby thread aged past 24h", () => {
    expect(
      isServiceSendBlocked({
        state: "standby",
        lastIncomingMessageAt: ago(THREAD_IDLE_AFTER_MS),
        threadControlUpdatedAt: null,
        isTemplateMessage: false,
        now: NOW,
      }),
    ).toBe(false)
  })
})

describe("isInboxThreadControlActive", () => {
  test("null means never seen", () => {
    expect(isInboxThreadControlActive(null, NOW)).toBe(false)
  })

  test("active within 30 days", () => {
    expect(
      isInboxThreadControlActive(ago(THREAD_CONTROL_INBOX_ACTIVE_MS - 1), NOW),
    ).toBe(true)
  })

  test("decays at exactly 30 days", () => {
    expect(
      isInboxThreadControlActive(ago(THREAD_CONTROL_INBOX_ACTIVE_MS), NOW),
    ).toBe(false)
  })
})

describe("parseThreadControlRole", () => {
  test("accepts a known role", () => {
    expect(parseThreadControlRole("ai_agent")).toBe("ai_agent")
  })

  test.each([
    "future_role",
    "",
    null,
    undefined,
    42,
  ])("stores %s as null (forward compatible)", (value) => {
    expect(parseThreadControlRole(value)).toBeNull()
  })
})

describe("toThreadControlTimestamp", () => {
  test("truncates our own event time to Meta's whole-second resolution", () => {
    expect(toThreadControlTimestamp(new Date(NOW.getTime() + 999))).toEqual(NOW)
    expect(toThreadControlTimestamp(NOW)).toEqual(NOW)
  })
})

describe("readThreadControlColumns", () => {
  test("reads a DB row as is", () => {
    expect(
      readThreadControlColumns({
        threadControlState: "owned",
        lastIncomingMessageAt: NOW,
        threadControlUpdatedAt: null,
      }),
    ).toEqual({
      state: "owned",
      lastIncomingMessageAt: NOW,
      threadControlUpdatedAt: null,
      threadOwnerExpiresAt: null,
    })
  })

  test("revives ISO strings from a job payload", () => {
    expect(
      readThreadControlColumns({
        threadControlState: "standby",
        lastIncomingMessageAt: NOW.toISOString(),
        threadControlUpdatedAt: NOW.toISOString(),
      }),
    ).toEqual({
      state: "standby",
      lastIncomingMessageAt: NOW,
      threadControlUpdatedAt: NOW,
      threadOwnerExpiresAt: null,
    })
  })

  test("a row that predates the routing columns reads as never observed", () => {
    expect(readThreadControlColumns({})).toEqual({
      state: null,
      lastIncomingMessageAt: null,
      threadControlUpdatedAt: null,
      threadOwnerExpiresAt: null,
    })
  })

  test("reads and revives the channel expiry", () => {
    expect(
      readThreadControlColumns({ threadOwnerExpiresAt: NOW })
        .threadOwnerExpiresAt,
    ).toEqual(NOW)
    expect(
      readThreadControlColumns({ threadOwnerExpiresAt: NOW.toISOString() })
        .threadOwnerExpiresAt,
    ).toEqual(NOW)
  })
})

describe("resolveThreadControlState — channel expiry", () => {
  const base = {
    lastIncomingMessageAt: ago(1000),
    threadControlUpdatedAt: ago(1000),
    now: NOW,
  } as const

  test.each([
    "owned",
    "standby",
  ] as const)("WhatsApp/no-expiry regression: %s resolves exactly as before for undefined and null expiry", (state) => {
    for (const expiry of [undefined, null]) {
      // Within 24h: kept. At/after 24h since the latest reference: idle.
      expect(
        resolveThreadControlState({
          ...base,
          state,
          threadOwnerExpiresAt: expiry,
        }),
      ).toBe(state)
      expect(
        resolveThreadControlState({
          state,
          lastIncomingMessageAt: ago(THREAD_IDLE_AFTER_MS),
          threadControlUpdatedAt: null,
          threadOwnerExpiresAt: expiry,
          now: NOW,
        }),
      ).toBe("idle")
      expect(
        resolveThreadControlState({
          state,
          lastIncomingMessageAt: ago(THREAD_IDLE_AFTER_MS - 1),
          threadControlUpdatedAt: null,
          threadOwnerExpiresAt: expiry,
          now: NOW,
        }),
      ).toBe(state)
    }
  })

  test("keeps the state before the expiry, even when activity is older than 24h", () => {
    expect(
      resolveThreadControlState({
        state: "standby",
        lastIncomingMessageAt: ago(THREAD_IDLE_AFTER_MS * 3),
        threadControlUpdatedAt: ago(THREAD_IDLE_AFTER_MS * 3),
        threadOwnerExpiresAt: new Date(NOW.getTime() + 1),
        now: NOW,
      }),
    ).toBe("standby")
  })

  test("is idle at and after the expiry, even when activity is recent", () => {
    for (const offset of [0, 1, 60_000]) {
      expect(
        resolveThreadControlState({
          ...base,
          state: "standby",
          threadOwnerExpiresAt: new Date(NOW.getTime() - offset),
        }),
      ).toBe("idle")
    }
  })

  test("a null or idle state is returned as is regardless of the expiry", () => {
    expect(
      resolveThreadControlState({
        ...base,
        state: null,
        threadOwnerExpiresAt: ago(1),
      }),
    ).toBeNull()
    expect(
      resolveThreadControlState({
        ...base,
        state: "idle",
        threadOwnerExpiresAt: new Date(NOW.getTime() + 1000),
      }),
    ).toBe("idle")
  })

  test("isServiceSendBlocked honors the expiry", () => {
    const input = {
      ...base,
      state: "standby" as const,
      isTemplateMessage: false,
    }
    expect(
      isServiceSendBlocked({
        ...input,
        threadOwnerExpiresAt: new Date(NOW.getTime() + 1000),
      }),
    ).toBe(true)
    expect(
      isServiceSendBlocked({ ...input, threadOwnerExpiresAt: ago(0) }),
    ).toBe(false)
  })
})
