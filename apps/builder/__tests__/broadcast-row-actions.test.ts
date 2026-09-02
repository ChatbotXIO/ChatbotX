import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  BROADCAST_ROW_ACTION_VARIANTS,
  filterBroadcastRowActions,
  getBroadcastRowActions,
  ROW_ACTION_GUARDS,
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

  test("has an entry covering every broadcast status", () => {
    for (const status of broadcastStatuses.options) {
      expect(ROW_ACTIONS_BY_STATUS[status]).toBeDefined()
    }
  })

  test("only a draft is editable", () => {
    for (const status of broadcastStatuses.options) {
      if (status === "draft") {
        continue
      }
      expect(ROW_ACTIONS_BY_STATUS[status]).not.toContain("edit")
    }
  })

  test("draft: view, rename, edit, schedule, delete — no resend/moveToDraft/stop/resume", () => {
    expect(ROW_ACTIONS_BY_STATUS.draft).toEqual([
      "view",
      "rename",
      "edit",
      "schedule",
      "delete",
    ])
  })

  test("scheduled: view, rename, moveToDraft, delete — no edit/stop/resume/resend", () => {
    expect(ROW_ACTIONS_BY_STATUS.scheduled).toEqual([
      "view",
      "rename",
      "moveToDraft",
      "delete",
    ])
  })

  test("sending: view, rename, stop — no delete", () => {
    expect(ROW_ACTIONS_BY_STATUS.sending).toEqual(["view", "rename", "stop"])
    expect(ROW_ACTIONS_BY_STATUS.sending).not.toContain("delete")
  })

  test("cancelled: view, rename, resume, delete — no edit", () => {
    expect(ROW_ACTIONS_BY_STATUS.cancelled).toEqual([
      "view",
      "rename",
      "resume",
      "delete",
    ])
    expect(ROW_ACTIONS_BY_STATUS.cancelled).not.toContain("edit")
  })

  test("sent and failed: view, rename, resend, delete", () => {
    for (const status of ["sent", "failed"] as const) {
      expect(ROW_ACTIONS_BY_STATUS[status]).toEqual([
        "view",
        "rename",
        "resend",
        "delete",
      ])
      expect(ROW_ACTIONS_BY_STATUS[status]).not.toContain("schedule")
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
    expect(getBroadcastRowActions("sending")).toEqual(
      ROW_ACTIONS_BY_STATUS.sending,
    )
    expect(getBroadcastRowActions("cancelled")).toEqual(
      ROW_ACTIONS_BY_STATUS.cancelled,
    )
  })

  test("falls back to view and rename only for an unknown status string", () => {
    expect(getBroadcastRowActions("not-a-real-status")).toEqual([
      "view",
      "rename",
    ])
  })
})

describe("ROW_ACTION_GUARDS", () => {
  test("only `resume` has a guard — every other variant is always shown once its status allows it", () => {
    for (const variant of BROADCAST_ROW_ACTION_VARIANTS) {
      if (variant === "resume") {
        expect(ROW_ACTION_GUARDS[variant]).toBeDefined()
      } else {
        expect(ROW_ACTION_GUARDS[variant]).toBeUndefined()
      }
    }
  })

  test("resume guard hides for a never-prepared cancelled row (contactCount null)", () => {
    expect(ROW_ACTION_GUARDS.resume?.({ contactCount: null })).toBe(false)
  })

  test("resume guard shows once the broadcast has been prepared (contactCount set)", () => {
    expect(ROW_ACTION_GUARDS.resume?.({ contactCount: 0 })).toBe(true)
    expect(ROW_ACTION_GUARDS.resume?.({ contactCount: 42 })).toBe(true)
  })
})

describe("filterBroadcastRowActions", () => {
  test("hides resume for a cancelled row with contactCount null (never-prepared, cancelled by teardown)", () => {
    const actions = getBroadcastRowActions("cancelled")

    expect(filterBroadcastRowActions(actions, { contactCount: null })).toEqual([
      "view",
      "rename",
      "delete",
    ])
  })

  test("shows resume for a cancelled row with a contactCount (was actually sending)", () => {
    const actions = getBroadcastRowActions("cancelled")

    expect(filterBroadcastRowActions(actions, { contactCount: 10 })).toEqual([
      "view",
      "rename",
      "resume",
      "delete",
    ])
  })

  test("leaves ungated variants untouched regardless of contactCount", () => {
    const actions = getBroadcastRowActions("draft")

    expect(filterBroadcastRowActions(actions, { contactCount: null })).toEqual(
      actions,
    )
  })
})
