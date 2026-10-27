import { describe, expect, test } from "vitest"
import { emptyAssignees, groupAssignees } from "../src/pipeline/item-assignees"

const assigneesOf = (
  grouped: ReturnType<typeof groupAssignees>,
  itemId: string,
) => grouped.get(itemId) ?? emptyAssignees()

describe("groupAssignees", () => {
  test("buckets members and teams per item in row order", () => {
    const grouped = groupAssignees([
      { itemId: "1", workspaceMemberId: "m1", inboxTeamId: null },
      { itemId: "1", workspaceMemberId: null, inboxTeamId: "t1" },
      { itemId: "2", workspaceMemberId: "m2", inboxTeamId: null },
    ])

    expect(assigneesOf(grouped, "1")).toEqual({
      workspaceMemberIds: ["m1"],
      inboxTeamIds: ["t1"],
    })
    expect(assigneesOf(grouped, "2").workspaceMemberIds).toEqual(["m2"])
  })

  test("returns an empty bucket for an item without assignees", () => {
    expect(assigneesOf(groupAssignees([]), "9")).toEqual({
      workspaceMemberIds: [],
      inboxTeamIds: [],
    })
  })
})
