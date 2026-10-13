import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  BROADCAST_ROW_ACTION_VARIANTS,
  type BroadcastRowActionGuardRow,
  filterBroadcastRowActions,
  getBroadcastRowActions,
  ROW_ACTION_GUARDS,
  ROW_ACTION_ITEMS,
  ROW_ACTIONS_BY_STATUS,
  resolveBroadcastRowActionLabelKey,
} from "@/features/broadcasts/lib/broadcast-row-actions"

const oneOff = (
  overrides: Partial<BroadcastRowActionGuardRow> = {},
): BroadcastRowActionGuardRow => ({
  contactCount: null,
  status: "draft",
  schedulesType: "now",
  occurrenceAt: null,
  ...overrides,
})

const template = (
  overrides: Partial<BroadcastRowActionGuardRow> = {},
): BroadcastRowActionGuardRow =>
  oneOff({ schedulesType: "recurring", status: "recurring", ...overrides })

describe("ROW_ACTIONS_BY_STATUS", () => {
  test("every status includes view, rename and clone", () => {
    for (const status of broadcastStatuses.options) {
      expect(ROW_ACTIONS_BY_STATUS[status]).toEqual(
        expect.arrayContaining(["view", "rename", "clone"]),
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

  test("draft: view, rename, clone, edit, schedule, delete — no resend/moveToDraft/stop/resume", () => {
    expect(ROW_ACTIONS_BY_STATUS.draft).toEqual([
      "view",
      "rename",
      "clone",
      "edit",
      "schedule",
      "delete",
    ])
  })

  test("scheduled: view, rename, clone, moveToDraft, delete — no edit/stop/resume/resend", () => {
    expect(ROW_ACTIONS_BY_STATUS.scheduled).toEqual([
      "view",
      "rename",
      "clone",
      "moveToDraft",
      "delete",
    ])
  })

  test("sending: view, rename, clone, stop — no delete", () => {
    expect(ROW_ACTIONS_BY_STATUS.sending).toEqual([
      "view",
      "rename",
      "clone",
      "stop",
    ])
    expect(ROW_ACTIONS_BY_STATUS.sending).not.toContain("delete")
  })

  test("recurring: pausable and editable, with its runs", () => {
    expect(ROW_ACTIONS_BY_STATUS.recurring).toEqual([
      "view",
      "rename",
      "clone",
      "viewRuns",
      "moveToDraft",
      "stop",
      "delete",
    ])
  })

  test("cancelled: resumable and, for a paused series, editable — never `edit`", () => {
    expect(ROW_ACTIONS_BY_STATUS.cancelled).toEqual([
      "view",
      "rename",
      "clone",
      "viewRuns",
      "moveToDraft",
      "resume",
      "delete",
    ])
    expect(ROW_ACTIONS_BY_STATUS.cancelled).not.toContain("edit")
  })

  test("sent and failed: resend and delete; only sent can list runs", () => {
    expect(ROW_ACTIONS_BY_STATUS.sent).toEqual([
      "view",
      "rename",
      "clone",
      "viewRuns",
      "resend",
      "delete",
    ])
    expect(ROW_ACTIONS_BY_STATUS.failed).toEqual([
      "view",
      "rename",
      "clone",
      "resend",
      "delete",
    ])
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

  test("falls back to view, rename and clone only for an unknown status string", () => {
    expect(getBroadcastRowActions("not-a-real-status")).toEqual([
      "view",
      "rename",
      "clone",
    ])
  })
})

describe("ROW_ACTION_GUARDS", () => {
  test("guards exactly the variants whose eligibility depends on the row", () => {
    const guarded = BROADCAST_ROW_ACTION_VARIANTS.filter(
      (variant) => ROW_ACTION_GUARDS[variant] !== undefined,
    )
    expect(guarded.sort()).toEqual(
      ["moveToDraft", "resend", "resume", "viewRuns"].sort(),
    )
  })

  test("resume guard hides for a never-prepared cancelled row (contactCount null)", () => {
    expect(ROW_ACTION_GUARDS.resume?.(oneOff({ status: "cancelled" }))).toBe(
      false,
    )
  })

  test("resume guard shows once the broadcast has been prepared (contactCount set)", () => {
    expect(ROW_ACTION_GUARDS.resume?.(oneOff({ contactCount: 0 }))).toBe(true)
    expect(ROW_ACTION_GUARDS.resume?.(oneOff({ contactCount: 42 }))).toBe(true)
  })

  test("resume guard shows for a paused series, which never has recipients of its own", () => {
    expect(ROW_ACTION_GUARDS.resume?.(template({ status: "cancelled" }))).toBe(
      true,
    )
  })

  test("viewRuns is for a series only, not for a one-off or one of its runs", () => {
    expect(ROW_ACTION_GUARDS.viewRuns?.(template())).toBe(true)
    expect(ROW_ACTION_GUARDS.viewRuns?.(oneOff({ status: "sent" }))).toBe(false)
    expect(
      ROW_ACTION_GUARDS.viewRuns?.(
        template({ occurrenceAt: new Date("2026-10-16T02:00:00Z") }),
      ),
    ).toBe(false)
  })

  test("resend is never offered for a series", () => {
    expect(ROW_ACTION_GUARDS.resend?.(template({ status: "sent" }))).toBe(false)
    expect(ROW_ACTION_GUARDS.resend?.(oneOff({ status: "sent" }))).toBe(true)
  })

  test("moveToDraft on a cancelled row is only for a paused series", () => {
    expect(
      ROW_ACTION_GUARDS.moveToDraft?.(oneOff({ status: "cancelled" })),
    ).toBe(false)
    expect(
      ROW_ACTION_GUARDS.moveToDraft?.(template({ status: "cancelled" })),
    ).toBe(true)
    expect(
      ROW_ACTION_GUARDS.moveToDraft?.(oneOff({ status: "scheduled" })),
    ).toBe(true)
  })
})

describe("filterBroadcastRowActions", () => {
  test("hides resume and moveToDraft for a never-prepared cancelled one-off", () => {
    const actions = getBroadcastRowActions("cancelled")

    expect(
      filterBroadcastRowActions(actions, oneOff({ status: "cancelled" })),
    ).toEqual(["view", "rename", "clone", "delete"])
  })

  test("shows resume for a cancelled one-off that was actually sending", () => {
    const actions = getBroadcastRowActions("cancelled")

    expect(
      filterBroadcastRowActions(
        actions,
        oneOff({ status: "cancelled", contactCount: 10 }),
      ),
    ).toEqual(["view", "rename", "clone", "resume", "delete"])
  })

  test("a paused series can list runs, edit its schedule and resume", () => {
    const actions = getBroadcastRowActions("cancelled")

    expect(
      filterBroadcastRowActions(actions, template({ status: "cancelled" })),
    ).toEqual([
      "view",
      "rename",
      "clone",
      "viewRuns",
      "moveToDraft",
      "resume",
      "delete",
    ])
  })

  test("an ended series lists runs but cannot be resent", () => {
    const actions = getBroadcastRowActions("sent")

    expect(
      filterBroadcastRowActions(actions, template({ status: "sent" })),
    ).toEqual(["view", "rename", "clone", "viewRuns", "delete"])
  })

  test("leaves ungated variants untouched", () => {
    const actions = getBroadcastRowActions("draft")

    expect(filterBroadcastRowActions(actions, oneOff())).toEqual(actions)
  })
})

describe("resolveBroadcastRowActionLabelKey", () => {
  test("a series edits its schedule where a one-off moves to draft", () => {
    expect(resolveBroadcastRowActionLabelKey("moveToDraft", template())).toBe(
      "actions.editSchedule",
    )
    expect(
      resolveBroadcastRowActionLabelKey(
        "moveToDraft",
        oneOff({ status: "scheduled" }),
      ),
    ).toBe("actions.moveToDraft")
  })

  test("other actions keep their own label", () => {
    expect(resolveBroadcastRowActionLabelKey("stop", template())).toBe(
      "actions.stop",
    )
  })
})
