import { describe, expect, test } from "vitest"
import {
  type ActivityChangeLabels,
  activityChange,
  NO_ACTIVITY_VALUE,
} from "../src/features/pipelines/lib/activity-change"

const labels: ActivityChangeLabels = {
  status: (status) => `status:${status}`,
  priority: (priority) => `priority:${priority}`,
  value: (value) => `$${value}`,
  date: (date) => date.toISOString().slice(0, 10),
}

describe("activityChange", () => {
  // Names come from the server, so a stage of another pipeline (before a
  // transfer) still reads by name.
  test("reads stage changes through the names sent with the row", () => {
    expect(
      activityChange(
        {
          kind: "stageChanged",
          fromStageId: "1",
          toStageId: "2",
          fromStageName: "Lead",
          toStageName: "Won deals",
        },
        labels,
      ),
    ).toEqual({ from: "Lead", to: "Won deals" })
  })

  test("a deleted stage shows as a dash instead of its id", () => {
    expect(
      activityChange(
        {
          kind: "stageChanged",
          fromStageId: "99",
          toStageId: "1",
          fromStageName: null,
          toStageName: "Lead",
        },
        labels,
      ),
    ).toEqual({ from: NO_ACTIVITY_VALUE, to: "Lead" })
  })

  test("a transfer shows both pipeline · stage places", () => {
    expect(
      activityChange(
        {
          kind: "transferred",
          fromPipelineName: "Sales",
          fromStageName: "Qualified",
          pipelineName: "Support",
          toStageName: "New Issue",
        },
        labels,
      ),
    ).toEqual({ from: "Sales · Qualified", to: "Support · New Issue" })
    expect(
      activityChange(
        {
          kind: "transferred",
          fromPipelineName: null,
          pipelineName: "Support",
        },
        labels,
      ),
    ).toEqual({
      from: `${NO_ACTIVITY_VALUE} · ${NO_ACTIVITY_VALUE}`,
      to: `Support · ${NO_ACTIVITY_VALUE}`,
    })
  })

  test("labels status, priority, value, due date and title", () => {
    expect(
      activityChange(
        { kind: "statusChanged", fromStatus: "open", toStatus: "won" },
        labels,
      ),
    ).toEqual({ from: "status:open", to: "status:won" })
    expect(
      activityChange(
        { kind: "priorityChanged", fromPriority: "low", toPriority: "high" },
        labels,
      ),
    ).toEqual({ from: "priority:low", to: "priority:high" })
    expect(
      activityChange(
        { kind: "valueChanged", fromValue: 0, toValue: 1234.5 },
        labels,
      ),
    ).toEqual({ from: "$0", to: "$1234.5" })
    expect(
      activityChange(
        {
          kind: "dueDateChanged",
          fromDueDate: null,
          toDueDate: new Date("2026-11-01T00:00:00Z"),
        },
        labels,
      ),
    ).toEqual({ from: NO_ACTIVITY_VALUE, to: "2026-11-01" })
    expect(
      activityChange(
        { kind: "titleChanged", fromTitle: "Old", toTitle: "New" },
        labels,
      ),
    ).toEqual({ from: "Old", to: "New" })
  })

  test("a cleared value reads as a dash, zero does not", () => {
    expect(
      activityChange(
        { kind: "valueChanged", fromValue: 0, toValue: null },
        labels,
      ),
    ).toEqual({ from: "$0", to: NO_ACTIVITY_VALUE })
  })

  test("kinds without a scalar before/after carry no change", () => {
    for (const kind of [
      "created",
      "commentAdded",
      "attachmentAdded",
      "assigneesChanged",
      "fieldValuesChanged",
    ] as const) {
      expect(activityChange({ kind }, labels)).toBeNull()
    }
  })
})
