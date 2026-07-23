import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ConditionEvaluationContext } from "../src/trigger/types"

const { contactCustomFieldFindFirst, customFieldFindFirst } = vi.hoisted(
  () => ({
    contactCustomFieldFindFirst: vi.fn(),
    customFieldFindFirst: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactCustomFieldModel: { findFirst: contactCustomFieldFindFirst },
      customFieldModel: { findFirst: customFieldFindFirst },
    },
  },
}))

import { ConditionEvaluator } from "../src/trigger/services/condition-evaluator"

const workspace = { timezone: "UTC" } as WorkspaceModel

const buildContext = (
  condition: Partial<ConditionEvaluationContext["condition"]>,
  metadata: Record<string, unknown> = {},
  workspaceOverride: WorkspaceModel = workspace,
): ConditionEvaluationContext =>
  ({
    condition: {
      sourceId: null,
      operator: null,
      value: null,
      ...condition,
    },
    eventData: {
      workspaceId: "ws-1",
      contactId: "contact-1",
      eventType: condition.type,
      eventData: metadata,
      timestamp: new Date(),
    },
    workspaceId: "ws-1",
    contactId: "contact-1",
    workspace: workspaceOverride,
  }) as ConditionEvaluationContext

describe("ConditionEvaluator contactInfoUpdated", () => {
  const evaluator = new ConditionEvaluator()

  test("matches when the updated info type equals the condition sourceId", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          {
            type: triggerEventTypes.enum.contactInfoUpdated,
            sourceId: "phone",
          },
          { infoType: "phone", newValue: "+84912345678" },
        ),
      ),
    ).resolves.toBe(true)
  })

  test("does not match a different info type", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          {
            type: triggerEventTypes.enum.contactInfoUpdated,
            sourceId: "email",
          },
          { infoType: "phone", newValue: "+84912345678" },
        ),
      ),
    ).resolves.toBe(false)
  })

  test("does not match when the condition has no sourceId", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          { type: triggerEventTypes.enum.contactInfoUpdated, sourceId: null },
          { infoType: "phone", newValue: "+84912345678" },
        ),
      ),
    ).resolves.toBe(false)
  })

  test("still matches tag conditions through the shared source-id check", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          { type: triggerEventTypes.enum.tagApplied, sourceId: "tag-1" },
          { tagId: "tag-1" },
        ),
      ),
    ).resolves.toBe(true)
  })
})

describe("ConditionEvaluator dateTimeBasedTrigger timezone", () => {
  const evaluator = new ConditionEvaluator()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // 14:00 UTC is 21:00 in Asia/Ho_Chi_Minh (+7), so an `at: "21"` condition
    // only fires when the hour-of-day is resolved in the +7 zone, never in UTC.
    vi.setSystemTime(new Date("2026-07-11T14:00:00.000Z"))
    contactCustomFieldFindFirst.mockResolvedValue({
      value: "2026-07-11T02:00:00.000Z",
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("resolves hour-of-day in the condition's captured timezone over the workspace zone", async () => {
    await expect(
      evaluator.evaluate(
        buildContext({
          type: triggerEventTypes.enum.dateTimeBasedTrigger,
          sourceId: "cf-1",
          value: {
            triggerType: "atTheDayOf",
            at: "21",
            timezone: "Asia/Ho_Chi_Minh",
          },
        }),
      ),
    ).resolves.toBe(true)
  })

  test("does not fire when the captured timezone puts the hour-of-day elsewhere", async () => {
    await expect(
      evaluator.evaluate(
        buildContext({
          type: triggerEventTypes.enum.dateTimeBasedTrigger,
          sourceId: "cf-1",
          value: {
            triggerType: "atTheDayOf",
            at: "21",
            timezone: "UTC",
          },
        }),
      ),
    ).resolves.toBe(false)
  })

  test("falls back to the workspace timezone when the condition has no captured zone", async () => {
    await expect(
      evaluator.evaluate(
        buildContext(
          {
            type: triggerEventTypes.enum.dateTimeBasedTrigger,
            sourceId: "cf-1",
            value: { triggerType: "atTheDayOf", at: "21" },
          },
          {},
          { timezone: "Asia/Ho_Chi_Minh" } as WorkspaceModel,
        ),
      ),
    ).resolves.toBe(true)
  })
})

describe("ConditionEvaluator dateTimeBasedTrigger date-type anchor", () => {
  const evaluator = new ConditionEvaluator()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // A `date` field persists as offset-preserved start-of-day in its source
    // zone. The VN date 2026-07-11 is stored as 2026-07-11T00:00:00+07:00.
    // The anchor is the START of the day (hour 0), never the legacy end-of-day
    // (hour 23).
    contactCustomFieldFindFirst.mockResolvedValue({
      value: "2026-07-11T00:00:00+07:00",
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("fires at the start of the day (hour 0) in the captured zone", async () => {
    // 17:00 UTC === 00:00 in Asia/Ho_Chi_Minh on 2026-07-11.
    vi.setSystemTime(new Date("2026-07-10T17:00:00.000Z"))
    await expect(
      evaluator.evaluate(
        buildContext({
          type: triggerEventTypes.enum.dateTimeBasedTrigger,
          sourceId: "cf-1",
          value: { triggerType: "atTheDayOf", timezone: "Asia/Ho_Chi_Minh" },
        }),
      ),
    ).resolves.toBe(true)
  })

  test("does not fire at the end of the day (hour 23), proving start-of-day anchoring", async () => {
    // 16:00 UTC === 23:00 in Asia/Ho_Chi_Minh on 2026-07-11.
    vi.setSystemTime(new Date("2026-07-11T16:00:00.000Z"))
    await expect(
      evaluator.evaluate(
        buildContext({
          type: triggerEventTypes.enum.dateTimeBasedTrigger,
          sourceId: "cf-1",
          value: { triggerType: "atTheDayOf", timezone: "Asia/Ho_Chi_Minh" },
        }),
      ),
    ).resolves.toBe(false)
  })

  test("degrades a crafted/invalid captured zone to UTC instead of throwing", async () => {
    // Before the guard, an unrecognized zone threw a RangeError from
    // toLocaleString, rejecting evaluation. It must now resolve as UTC: at
    // 17:00 UTC the default hour matches the UTC-resolved anchor on 2026-07-10.
    vi.setSystemTime(new Date("2026-07-10T17:00:00.000Z"))
    await expect(
      evaluator.evaluate(
        buildContext({
          type: triggerEventTypes.enum.dateTimeBasedTrigger,
          sourceId: "cf-1",
          value: { triggerType: "atTheDayOf", timezone: "Not/AZone" },
        }),
      ),
    ).resolves.toBe(true)
  })
})
