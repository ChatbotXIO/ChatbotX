import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  BROADCAST_FILTER_STATUSES,
  broadcastStatusConfig,
  parseBroadcastStatus,
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
