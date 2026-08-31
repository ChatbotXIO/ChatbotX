import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  BROADCAST_ROW_ACTION_VARIANTS,
  getBroadcastRowActions,
  ROW_ACTION_ITEMS,
  ROW_ACTIONS_BY_STATUS,
} from "@/features/broadcasts/lib/broadcast-row-actions"

describe("ROW_ACTIONS_BY_STATUS", () => {
  test("every status includes view and rename", () => {
    for (const status of broadcastStatuses.options) {
      expect(ROW_ACTIONS_BY_STATUS[status]).toEqual(
        expect.arrayContaining(["view", "rename"]),
      )
    }
  })

  test("draft offers schedule and delete but not resend", () => {
    expect(ROW_ACTIONS_BY_STATUS.draft).toEqual(
      expect.arrayContaining(["schedule", "delete"]),
    )
    expect(ROW_ACTIONS_BY_STATUS.draft).not.toContain("resend")
  })

  test("sent and failed offer resend but not schedule or delete", () => {
    for (const status of ["sent", "failed"] as const) {
      expect(ROW_ACTIONS_BY_STATUS[status]).toContain("resend")
      expect(ROW_ACTIONS_BY_STATUS[status]).not.toContain("schedule")
      expect(ROW_ACTIONS_BY_STATUS[status]).not.toContain("delete")
    }
  })

  test("scheduled, sending, and cancelled offer only view and rename", () => {
    for (const status of ["scheduled", "sending", "cancelled"] as const) {
      expect(ROW_ACTIONS_BY_STATUS[status]).toEqual(["view", "rename"])
    }
  })

  test("has an entry covering every broadcast status", () => {
    for (const status of broadcastStatuses.options) {
      expect(ROW_ACTIONS_BY_STATUS[status]).toBeDefined()
    }
  })
})

describe("ROW_ACTION_ITEMS", () => {
  test("has an icon and matching labelKey for every variant", () => {
    for (const variant of BROADCAST_ROW_ACTION_VARIANTS) {
      expect(ROW_ACTION_ITEMS[variant].icon).toBeDefined()
      expect(ROW_ACTION_ITEMS[variant].labelKey).toBe(`actions.${variant}`)
    }
  })
})

describe("getBroadcastRowActions", () => {
  test("resolves the action list for a valid status string", () => {
    expect(getBroadcastRowActions("draft")).toEqual(ROW_ACTIONS_BY_STATUS.draft)
    expect(getBroadcastRowActions("sent")).toEqual(ROW_ACTIONS_BY_STATUS.sent)
  })

  test("falls back to view and rename only for an unknown status string", () => {
    expect(getBroadcastRowActions("not-a-real-status")).toEqual([
      "view",
      "rename",
    ])
  })
})
