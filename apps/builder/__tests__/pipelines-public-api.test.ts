// @vitest-environment node

import {
  mergePipelineSettings,
  pipelineSettingsSchema,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { toItemListQuery } from "../src/features/pipelines/lib/list-items-query"
import {
  createItemPublicRequest,
  deleteStagePublicRequest,
  listItemsPublicRequest,
  pipelineStatsPublicRequest,
  setMemberPublicRequest,
  updatePipelinePublicRequest,
} from "../src/features/pipelines/schema/public"
import { pipelineItemFilterRequest } from "../src/features/pipelines/schema/query"

describe("pipelines public request schemas", () => {
  test("a settings patch keeps only what the caller sent", () => {
    const parsed = updatePipelinePublicRequest.parse({
      id: "1",
      settings: { assignContactOnAssign: true },
    })

    expect(parsed.settings).toEqual({ assignContactOnAssign: true })
  })

  test("merging a one-group patch leaves every other stored setting alone", () => {
    const stored = pipelineSettingsSchema.parse({
      statusLabels: { open: "Open", won: "Resolved", lost: "Not Resolved" },
      maxOpenItemsPerContact: 3,
      cardElements: { cardId: true },
    })

    const merged = mergePipelineSettings(stored, {
      assignContactOnAssign: true,
      statusLabels: { won: "Done" },
    })

    expect(merged.assignContactOnAssign).toBe(true)
    expect(merged.statusLabels).toEqual({
      open: "Open",
      won: "Done",
      lost: "Not Resolved",
    })
    expect(merged.maxOpenItemsPerContact).toBe(3)
    expect(merged.cardElements.cardId).toBe(true)
  })

  test("a null open-item limit clears it, an omitted one keeps it", () => {
    const stored = pipelineSettingsSchema.parse({ maxOpenItemsPerContact: 5 })

    expect(
      mergePipelineSettings(stored, { maxOpenItemsPerContact: null })
        .maxOpenItemsPerContact,
    ).toBeNull()
    expect(mergePipelineSettings(stored, {}).maxOpenItemsPerContact).toBe(5)
  })

  test.each([
    ["a value above numeric(19,4)", { value: 1e16 }],
    ["a negative value", { value: -1 }],
    ["a non-numeric contact id", { contactId: "abc" }],
    ["an empty title", { title: "  " }],
  ])("createItem rejects %s", (_name, override) => {
    const result = createItemPublicRequest.safeParse({
      id: "1",
      contactId: "2",
      title: "Deal",
      ...override,
    })

    expect(result.success).toBe(false)
  })

  test("createItem accepts the documented fields", () => {
    const parsed = createItemPublicRequest.parse({
      id: "1",
      contactId: "2",
      title: "Deal",
      value: 1500.5,
      fieldValues: { "10": "gold", "11": null },
      idempotencyKey: "flow-1:step-2",
    })

    expect(parsed.fieldValues).toEqual({ "10": "gold", "11": null })
  })

  test("createItem caps the number of custom field values", () => {
    const fieldValues = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [String(index), "x"]),
    )

    expect(
      createItemPublicRequest.safeParse({
        id: "1",
        contactId: "2",
        title: "Deal",
        fieldValues,
      }).success,
    ).toBe(false)
  })

  test("listItems maps every board filter onto the repository filter", () => {
    const parsed = listItemsPublicRequest.parse({
      id: "1",
      updatedFrom: "2026-01-01T00:00:00.000Z",
      lastCommentTo: "2026-02-01T00:00:00.000Z",
      statusChangedFrom: "2026-01-02T00:00:00.000Z",
      stageEnteredTo: "2026-01-03T00:00:00.000Z",
      wonClosedFrom: "2026-01-04T00:00:00.000Z",
      lostClosedTo: "2026-01-05T00:00:00.000Z",
      fieldId: "99",
      fieldOperator: "is",
      fieldValue: "gold",
    })
    const { filter } = toItemListQuery(parsed)

    expect(filter.updatedAt?.from).toEqual(new Date("2026-01-01T00:00:00.000Z"))
    expect(filter.lastCommentAt?.to).toEqual(
      new Date("2026-02-01T00:00:00.000Z"),
    )
    expect(filter.statusChangedAt?.from).toBeInstanceOf(Date)
    expect(filter.stageEnteredAt?.to).toBeInstanceOf(Date)
    expect(filter.closedAs?.won?.from).toBeInstanceOf(Date)
    expect(filter.closedAs?.lost?.to).toBeInstanceOf(Date)
    expect(filter.closedAs?.won?.to).toBeUndefined()
    expect(filter.fieldConditions).toEqual({
      "99": { operator: "is", value: "gold", valueTo: undefined },
    })
  })

  test("listItems takes the board's any-of lists and several field conditions", () => {
    const { filter } = toItemListQuery(
      listItemsPublicRequest.parse({
        id: "1",
        stageId: "11,12",
        status: "won,lost",
        priority: "high",
        assigneeMemberId: "21,22",
        assigneeInboxTeamId: "31",
        fieldConditions: JSON.stringify({
          "41": { operator: "gt", value: "5" },
          "42": { operator: "hasValue" },
        }),
        fieldId: "43",
        fieldOperator: "is",
        fieldValue: "VIP",
      }),
    )

    expect(filter).toMatchObject({
      stageIds: ["11", "12"],
      statuses: ["won", "lost"],
      priorities: ["high"],
      assigneeMemberIds: ["21", "22"],
      assigneeTeamIds: ["31"],
    })
    expect(Object.keys(filter.fieldConditions ?? {}).sort()).toEqual([
      "41",
      "42",
      "43",
    ])
  })

  test("listItems rejects malformed field conditions and unknown statuses", () => {
    expect(
      listItemsPublicRequest.safeParse({ id: "1", fieldConditions: "{oops" })
        .success,
    ).toBe(false)
    expect(
      listItemsPublicRequest.safeParse({ id: "1", status: "open,maybe" })
        .success,
    ).toBe(false)
  })

  test("fieldValuesTimezone must be a real IANA zone", () => {
    const ok = createItemPublicRequest.safeParse({
      id: "1",
      contactId: "2",
      title: "x",
      fieldValuesTimezone: "Asia/Ho_Chi_Minh",
    })
    const bad = createItemPublicRequest.safeParse({
      id: "1",
      contactId: "2",
      title: "x",
      fieldValuesTimezone: "Mars/Olympus",
    })

    expect(ok.success).toBe(true)
    expect(bad.success).toBe(false)
  })

  test("listItems without the new params adds no extra filters", () => {
    const { filter } = toItemListQuery(
      listItemsPublicRequest.parse({ id: "1" }),
    )

    expect(filter.updatedAt).toBeUndefined()
    expect(filter.closedAs).toBeUndefined()
    expect(filter.fieldConditions).toBeUndefined()
  })

  test("listItems maps value and field operators onto the repository filter", () => {
    const { filter } = toItemListQuery(
      listItemsPublicRequest.parse({
        id: "1",
        valueOperator: "gt",
        valueAmount: "100",
        fieldId: "99",
        fieldOperator: "contains",
        fieldValue: "gold",
      }),
    )

    expect(filter.value).toEqual({
      operator: "gt",
      amount: 100,
      min: undefined,
      max: undefined,
    })
    expect(filter.fieldConditions).toEqual({
      "99": { operator: "contains", value: "gold", valueTo: undefined },
    })
  })

  test("listItems maps an interval and the timezone onto the repository filter", () => {
    const { filter } = toItemListQuery(
      listItemsPublicRequest.parse({
        id: "1",
        fieldId: "5",
        fieldOperator: "between",
        fieldValue: "2026-01-01",
        fieldValueTo: "2026-01-31",
        timezone: "Asia/Ho_Chi_Minh",
      }),
    )

    expect(filter.fieldConditions).toEqual({
      "5": {
        operator: "between",
        value: "2026-01-01",
        valueTo: "2026-01-31",
      },
    })
    expect(filter.timezone).toBe("Asia/Ho_Chi_Minh")
  })

  test("listItems rejects an unknown timezone and the removed field params", () => {
    expect(
      listItemsPublicRequest.safeParse({ id: "1", timezone: "Mars/Olympus" })
        .success,
    ).toBe(false)
    const parsed = listItemsPublicRequest.parse({
      id: "1",
      fieldId: "5",
      fieldFrom: "2026-01-01T00:00:00Z",
    })
    expect(parsed).not.toHaveProperty("fieldFrom")
  })

  test("listItems rejects a field operator without a field", () => {
    expect(
      listItemsPublicRequest.safeParse({ id: "1", fieldOperator: "hasValue" })
        .success,
    ).toBe(false)
  })

  test("listItems keeps the plain value interval without an operator", () => {
    const { filter } = toItemListQuery(
      listItemsPublicRequest.parse({ id: "1", valueMin: "5" }),
    )

    expect(filter.value).toMatchObject({ operator: undefined, min: 5 })
  })

  test("listItems hasValue needs no fieldValue", () => {
    const parsed = listItemsPublicRequest.safeParse({
      id: "1",
      fieldId: "99",
      fieldOperator: "hasValue",
    })

    expect(parsed.success).toBe(true)
  })

  test.each([
    { valueOperator: "eq" },
    { fieldOperator: "is", fieldValue: "x" },
    { fieldId: "99", fieldOperator: "contains" },
    { fieldId: "99", fieldOperator: "gt", fieldValue: "" },
  ])("listItems rejects an operator without its operand: %o", (patch) => {
    expect(
      listItemsPublicRequest.safeParse({ id: "1", ...patch }).success,
    ).toBe(false)
  })

  test("listItems defaults to newest first with a bounded page", () => {
    const parsed = listItemsPublicRequest.parse({ id: "1" })

    expect(parsed).toMatchObject({
      sort: "createdAt",
      direction: "desc",
      limit: 50,
    })
    expect(
      listItemsPublicRequest.safeParse({ id: "1", limit: 101 }).success,
    ).toBe(false)
  })

  test("stats dates must be YYYY-MM-DD instead of silently falling back", () => {
    expect(
      pipelineStatsPublicRequest.safeParse({
        id: "1",
        from: "2026/01/01",
        to: "2026-01-31",
      }).success,
    ).toBe(false)
    expect(
      pipelineStatsPublicRequest.safeParse({
        id: "1",
        from: "2026-01-01",
        to: "2026-01-31",
      }).success,
    ).toBe(true)
  })

  test("setMember requires an explicit view grant and defaults the rest to none", () => {
    expect(
      setMemberPublicRequest.safeParse({ id: "1", workspaceMemberId: "2" })
        .success,
    ).toBe(false)
    expect(
      setMemberPublicRequest.parse({
        id: "1",
        workspaceMemberId: "2",
        canView: true,
      }),
    ).toMatchObject({
      canEdit: false,
      canDelete: false,
      canManageSettings: false,
    })
  })

  test("deleteStage validates the destination stage id as a bigint", () => {
    expect(
      deleteStagePublicRequest.safeParse({
        id: "1",
        stageId: "2",
        moveItemsToStageId: "x; drop",
      }).success,
    ).toBe(false)
  })

  test.each([
    [
      "an assignee id past a signed bigint",
      { assigneeMemberId: "9".repeat(25) },
    ],
    ["a non-numeric team id", { assigneeInboxTeamId: "abc" }],
    ["a date before 1900", { dueFrom: "0001-01-01T00:00:00Z" }],
    ["a date after 2200", { createdTo: "3000-01-01T00:00:00Z" }],
    ["a NUL in the search", { search: "a\u0000b" }],
  ])("listItems rejects %s", (_name, patch) => {
    expect(
      listItemsPublicRequest.safeParse({ id: "1", ...patch }).success,
    ).toBe(false)
  })

  test("listItems accepts in-range ids, dates and search", () => {
    expect(
      listItemsPublicRequest.safeParse({
        id: "1",
        assigneeMemberId: "42",
        dueFrom: "2026-01-01T00:00:00Z",
        search: "acme",
      }).success,
    ).toBe(true)
  })

  test("createItem rejects NUL in text fields", () => {
    const base = { id: "1", contactId: "2", title: "ok" }
    expect(createItemPublicRequest.safeParse(base).success).toBe(true)
    expect(
      createItemPublicRequest.safeParse({ ...base, title: "a\u0000" }).success,
    ).toBe(false)
    expect(
      createItemPublicRequest.safeParse({ ...base, description: "a\u0000" })
        .success,
    ).toBe(false)
  })

  test("NUL is rejected in idempotency keys and stage descriptions", () => {
    const base = { id: "1", contactId: "2", title: "ok" }
    expect(
      createItemPublicRequest.safeParse({ ...base, idempotencyKey: "k\u0000" })
        .success,
    ).toBe(false)
    expect(
      createItemPublicRequest.safeParse({ ...base, idempotencyKey: "k" })
        .success,
    ).toBe(true)
  })

  test("field value keys are bigint field ids", () => {
    const base = { id: "1", contactId: "2", title: "ok" }
    for (const key of ["a\u0000b", "name", "9".repeat(25)]) {
      expect(
        createItemPublicRequest.safeParse({
          ...base,
          fieldValues: { [key]: "x" },
        }).success,
      ).toBe(false)
    }
    expect(
      createItemPublicRequest.safeParse({ ...base, fieldValues: { "12": "x" } })
        .success,
    ).toBe(true)
  })

  test("board filter field condition keys are bigint field ids", () => {
    expect(
      pipelineItemFilterRequest.safeParse({
        fieldConditions: { "a\u0000": { operator: "is", value: "x" } },
      }).success,
    ).toBe(false)
    expect(
      pipelineItemFilterRequest.safeParse({
        fieldConditions: { "12": { operator: "is", value: "x" } },
      }).success,
    ).toBe(true)
  })

  test("listItems maps the activity params onto one activity condition", () => {
    const { filter } = toItemListQuery(
      listItemsPublicRequest.parse({
        id: "1",
        activityGroups: "stage, comments",
        activityActor: "7,automation",
        activityFrom: "2026-01-01T00:00:00.000Z",
      }),
    )

    expect(filter.activityMatch).toEqual({
      kinds: ["stageChanged", "commentAdded", "commentDeleted"],
      actorUserIds: ["7"],
      automation: true,
      occurredAt: { from: new Date("2026-01-01T00:00:00.000Z"), to: undefined },
    })
  })

  test("listItems without activity params sets no activity condition", () => {
    const { filter } = toItemListQuery(
      listItemsPublicRequest.parse({ id: "1" }),
    )

    expect(filter.activityMatch).toBeUndefined()
  })

  test("listItems rejects an unknown activity group or actor", () => {
    expect(
      listItemsPublicRequest.safeParse({ id: "1", activityGroups: "nope" })
        .success,
    ).toBe(false)
    expect(
      listItemsPublicRequest.safeParse({ id: "1", activityActor: "bob" })
        .success,
    ).toBe(false)
  })
})
