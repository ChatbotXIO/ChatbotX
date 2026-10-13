import { describe, expect, test } from "vitest"
import {
  createBroadcastRequest,
  scheduleBroadcastSchema,
} from "../src/features/broadcasts/schema/action"
import {
  createBroadcastPublicRequest,
  listBroadcastOccurrencesPublicRequest,
  listBroadcastRunGroupsPublicRequest,
  previewRecurrencePublicRequest,
} from "../src/features/broadcasts/schema/public"

const recurrence = {
  frequency: "weekly" as const,
  interval: 1,
  weekdays: [1, 3],
  timeOfDay: "09:00",
  timezone: "Asia/Ho_Chi_Minh",
  startsOn: "2026-10-01",
  end: { kind: "never" as const },
}

const baseRequest = {
  channel: "whatsapp" as const,
  flowId: "1",
  subaction: "whatsappTemplateMessage" as const,
  schedulesAt: null,
  contactFilter: { operator: "and" as const, conditions: [] },
}

const issuePaths = (result: {
  success: boolean
  error?: { issues: { path: PropertyKey[] }[] }
}) => result.error?.issues.map((issue) => issue.path.join(".")) ?? []

describe("create request: the repeat rule", () => {
  test("a repeating broadcast needs its rule, and only a repeating one may have it", () => {
    const missing = createBroadcastRequest.safeParse({
      ...baseRequest,
      schedulesType: "recurring",
    })
    expect(missing.success).toBe(false)
    expect(issuePaths(missing)).toContain("recurrence")

    const stray = createBroadcastRequest.safeParse({
      ...baseRequest,
      schedulesType: "now",
      recurrence,
    })
    expect(stray.success).toBe(false)
    expect(issuePaths(stray)).toContain("recurrence")
  })

  test("a valid repeating broadcast is accepted without a start time", () => {
    expect(
      createBroadcastRequest.safeParse({
        ...baseRequest,
        schedulesType: "recurring",
        recurrence,
      }).success,
    ).toBe(true)
  })

  test("a draft or a one-off keeps behaving exactly as before", () => {
    expect(
      createBroadcastRequest.safeParse({
        ...baseRequest,
        schedulesType: "now",
      }).success,
    ).toBe(true)
    expect(
      createBroadcastRequest.safeParse({
        ...baseRequest,
        schedulesType: "future",
        schedulesAt: "2020-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false)
  })

  test("rule errors point at the field that is wrong, so a form can show them there", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      schedulesType: "recurring",
      recurrence: { ...recurrence, weekdays: undefined },
    })
    expect(issuePaths(result)).toContain("recurrence.weekdays")
  })

  test("the public request takes the same rule", () => {
    expect(
      createBroadcastPublicRequest.safeParse({
        ...baseRequest,
        schedulesType: "recurring",
        recurrence,
      }).success,
    ).toBe(true)
  })
})

describe("schedule request", () => {
  test("a repeating schedule needs no time, and may omit the rule to keep the saved one", () => {
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "recurring",
        schedulesAt: null,
      }).success,
    ).toBe(true)
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "recurring",
        schedulesAt: null,
        recurrence,
      }).success,
    ).toBe(true)
  })

  test("a repeat rule on a one-off schedule is rejected rather than silently dropped", () => {
    for (const schedulesType of ["now", "future"] as const) {
      const result = scheduleBroadcastSchema.safeParse({
        schedulesType,
        schedulesAt: "2999-01-01T00:00:00.000Z",
        recurrence,
      })
      expect(result.success).toBe(false)
      expect(issuePaths(result)).toContain("recurrence")
    }
  })

  test("a one-off future schedule still has to be in the future", () => {
    expect(
      scheduleBroadcastSchema.safeParse({
        schedulesType: "future",
        schedulesAt: "2020-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false)
  })
})

describe("read requests", () => {
  test("preview defaults to three runs and caps at ten", () => {
    expect(previewRecurrencePublicRequest.parse({ recurrence }).count).toBe(3)
    expect(
      previewRecurrencePublicRequest.safeParse({ recurrence, count: 11 })
        .success,
    ).toBe(false)
  })

  test("run groups default to day, 31 per page, and cap the page", () => {
    expect(
      listBroadcastRunGroupsPublicRequest.parse({ idOrName: "1" }),
    ).toMatchObject({ groupBy: "day", limit: 31 })
    expect(
      listBroadcastRunGroupsPublicRequest.safeParse({
        idOrName: "1",
        limit: 32,
      }).success,
    ).toBe(false)
    expect(
      listBroadcastRunGroupsPublicRequest.safeParse({
        idOrName: "1",
        groupBy: "year",
      }).success,
    ).toBe(false)
  })

  test("occurrences default to 50 and cap at 100", () => {
    expect(
      listBroadcastOccurrencesPublicRequest.parse({ idOrName: "1" }).limit,
    ).toBe(50)
    expect(
      listBroadcastOccurrencesPublicRequest.safeParse({
        idOrName: "1",
        limit: 101,
      }).success,
    ).toBe(false)
  })
})
