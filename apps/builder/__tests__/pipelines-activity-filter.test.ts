import { describe, expect, test } from "vitest"
import { listActivityPublicRequest } from "../src/features/pipelines/schema/public"
import { activityPageRequest } from "../src/features/pipelines/schema/query"

const base = { id: "1", itemId: "2" }

describe("pipelines.listActivity groups", () => {
  test("reads a comma-separated query list", () => {
    const parsed = listActivityPublicRequest.parse({
      ...base,
      groups: "stage, comments",
    })

    expect(parsed.groups).toEqual(["stage", "comments"])
  })

  test("an empty or missing list means every kind", () => {
    expect(listActivityPublicRequest.parse(base).groups).toBeUndefined()
    expect(
      listActivityPublicRequest.parse({ ...base, groups: " , " }).groups,
    ).toBeUndefined()
  })

  test("rejects an unknown group", () => {
    expect(
      listActivityPublicRequest.safeParse({ ...base, groups: "stage,bogus" })
        .success,
    ).toBe(false)
  })

  test("the private request takes the groups as an array", () => {
    const parsed = activityPageRequest.parse({
      workspaceId: "1",
      pipelineId: "2",
      itemId: "3",
      groups: ["status"],
    })

    expect(parsed.groups).toEqual(["status"])
  })
})

describe("pipelines.listItems value interval", () => {
  test("between needs at least one bound", async () => {
    const { listItemsPublicRequest } = await import(
      "../src/features/pipelines/schema/public"
    )
    expect(
      listItemsPublicRequest.safeParse({ id: "1", valueOperator: "between" })
        .success,
    ).toBe(false)
    expect(
      listItemsPublicRequest.safeParse({
        id: "1",
        valueOperator: "between",
        valueMin: "5",
      }).success,
    ).toBe(true)
  })
})
