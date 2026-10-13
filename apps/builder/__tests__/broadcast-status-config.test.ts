import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  BROADCAST_FILTER_STATUSES,
  BROADCAST_KINDS,
  broadcastStatusConfig,
  parseBroadcastStatus,
  resolveBroadcastDisplayState,
} from "@/features/broadcasts/lib/broadcast-status"
import { publicBroadcastResource } from "@/features/broadcasts/schema/resource"

const DOT_CLASS_NAME_PATTERN = /^bg-/

describe("broadcastStatusConfig", () => {
  test("covers every broadcast status", () => {
    for (const status of broadcastStatuses.options) {
      expect(broadcastStatusConfig[status].labelKey).toBe(
        `broadcasts.status.${status}`,
      )
      expect(broadcastStatusConfig[status].dotClassName).toMatch(
        DOT_CLASS_NAME_PATTERN,
      )
    }
  })

  test("filter list matches the design order, including cancelled", () => {
    expect(BROADCAST_FILTER_STATUSES).toEqual([
      "draft",
      "scheduled",
      "sending",
      "sent",
      "failed",
      "cancelled",
    ])
  })

  test("repeating is a kind of broadcast, not a status filter", () => {
    expect(BROADCAST_KINDS).toEqual(["repeating"])
    expect(BROADCAST_FILTER_STATUSES).not.toContain("recurring")
  })

  test("labels the paused and ended states of a repeating broadcast", () => {
    expect(broadcastStatusConfig.paused.labelKey).toBe(
      "broadcasts.status.paused",
    )
    expect(broadcastStatusConfig.ended.labelKey).toBe("broadcasts.status.ended")
  })
})

describe("resolveBroadcastDisplayState", () => {
  const template = { schedulesType: "recurring", occurrenceAt: null }

  test("a one-off keeps its own status", () => {
    for (const status of broadcastStatuses.options) {
      expect(
        resolveBroadcastDisplayState({
          status,
          schedulesType: "future",
          occurrenceAt: null,
        }),
      ).toBe(status)
    }
  })

  test("a repeating broadcast reads paused when cancelled and ended when sent", () => {
    expect(
      resolveBroadcastDisplayState({ ...template, status: "cancelled" }),
    ).toBe("paused")
    expect(resolveBroadcastDisplayState({ ...template, status: "sent" })).toBe(
      "ended",
    )
  })

  test("an active or draft repeating broadcast keeps its status", () => {
    expect(
      resolveBroadcastDisplayState({ ...template, status: "recurring" }),
    ).toBe("recurring")
    expect(resolveBroadcastDisplayState({ ...template, status: "draft" })).toBe(
      "draft",
    )
  })

  test("a run of a series is an ordinary broadcast", () => {
    expect(
      resolveBroadcastDisplayState({
        status: "cancelled",
        schedulesType: "recurring",
        occurrenceAt: new Date("2026-10-16T02:00:00Z"),
      }),
    ).toBe("cancelled")
  })

  test("an unknown status stays null", () => {
    expect(
      resolveBroadcastDisplayState({ ...template, status: "nope" }),
    ).toBeNull()
  })
})

describe("parseBroadcastStatus", () => {
  test("round-trips every valid broadcast status", () => {
    for (const status of broadcastStatuses.options) {
      expect(parseBroadcastStatus(status)).toBe(status)
    }
  })

  test("returns null for an unrecognized value", () => {
    expect(parseBroadcastStatus("nope")).toBeNull()
  })
})

describe("public broadcast resource", () => {
  test("accepts the new status values (additive API change)", () => {
    for (const status of ["draft", "failed"]) {
      expect(
        publicBroadcastResource.shape.status.safeParse(status).success,
      ).toBe(true)
    }
  })
})
