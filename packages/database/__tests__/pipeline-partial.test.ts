import { describe, expect, test } from "vitest"
import {
  activityKindsOf,
  isPipelineFilterDay,
  PIPELINE_ACTIVITY_KINDS_BY_GROUP,
  PIPELINE_LIMITS,
  pipelineActivityKinds,
  pipelineFieldConditionError,
  pipelineReferenceNameSchema,
  pipelineSettingsSchema,
  pipelineTypeDefaults,
  pipelineTypes,
  referenceNameFromName,
} from "../src/partials/pipeline"

describe("pipelineSettingsSchema", () => {
  test("parses an empty object by backfilling every key", () => {
    const settings = pipelineSettingsSchema.parse({})

    expect(settings.version).toBe(1)
    expect(settings.assignContactOnAssign).toBe(false)
    expect(settings.maxOpenItemsPerContact).toBeNull()
    expect(settings.cardElements.cardId).toBe(true)
    expect(settings.cardElements.dueDate).toBe(true)
    expect(settings.statusLabels).toEqual({
      open: "Open",
      won: "Won",
      lost: "Lost",
    })
  })

  test("backfills keys added after a row was stored", () => {
    const settings = pipelineSettingsSchema.parse({
      cardElements: { cardId: false },
    })

    expect(settings.cardElements.cardId).toBe(false)
    expect(settings.cardElements.comments).toBe(true)
  })

  test.each([0, 101, 1.5])("rejects maxOpenItemsPerContact %s", (value) => {
    expect(
      pipelineSettingsSchema.safeParse({ maxOpenItemsPerContact: value })
        .success,
    ).toBe(false)
  })

  test("rejects an empty status label", () => {
    expect(
      pipelineSettingsSchema.safeParse({ statusLabels: { won: "  " } }).success,
    ).toBe(false)
  })
})

describe("pipelineReferenceNameSchema", () => {
  test.each(["sales", "support_2", "a"])("accepts %s", (value) => {
    expect(pipelineReferenceNameSchema.safeParse(value).success).toBe(true)
  })

  test.each([
    "",
    "Sales",
    "2fast",
    "has space",
    "a-b",
    "x".repeat(65),
  ])("rejects %j", (value) => {
    expect(pipelineReferenceNameSchema.safeParse(value).success).toBe(false)
  })
})

describe("pipelineTypeDefaults", () => {
  test("covers every pipeline type with a first stage and status labels", () => {
    for (const type of pipelineTypes.options) {
      const defaults = pipelineTypeDefaults[type]
      expect(defaults.firstStageName.length).toBeGreaterThan(0)
      expect(defaults.statusLabels.open).toBeTruthy()
    }
  })

  test("maps each type to its UI noun", () => {
    expect(pipelineTypeDefaults.opportunity.nounKey).toBe("opportunity")
    expect(pipelineTypeDefaults.ticket.nounKey).toBe("ticket")
    expect(pipelineTypeDefaults.custom.nounKey).toBe("card")
  })

  test("keeps the bulk batch smaller than the synchronous threshold", () => {
    expect(PIPELINE_LIMITS.bulkBatchSize).toBeLessThan(
      PIPELINE_LIMITS.bulkSyncItems,
    )
  })
})

describe("referenceNameFromName", () => {
  test("folds Vietnamese diacritics and the stroked d", () => {
    expect(referenceNameFromName("Đàm phán khách hàng", "pipeline")).toBe(
      "dam_phan_khach_hang",
    )
    expect(referenceNameFromName("Customer Support", "pipeline")).toBe(
      "customer_support",
    )
  })

  test("prefixes names that do not start with a letter", () => {
    expect(referenceNameFromName("2024 Plan", "pipeline")).toBe(
      "pipeline_2024_plan",
    )
  })
})

describe("activity groups", () => {
  test("every activity kind belongs to exactly one group", () => {
    const grouped = Object.values(PIPELINE_ACTIVITY_KINDS_BY_GROUP).flat()

    expect([...grouped].sort()).toEqual(
      [...pipelineActivityKinds.options].sort(),
    )
  })

  test("no group means no kind filter; groups expand to their kinds", () => {
    expect(activityKindsOf(undefined)).toBeUndefined()
    expect(activityKindsOf([])).toBeUndefined()
    expect(activityKindsOf(["comments", "stage"])).toEqual([
      "commentAdded",
      "commentDeleted",
      "stageChanged",
    ])
  })
})

describe("custom-field filter operands", () => {
  test("a filter day must be a real day in years 0001-9999", () => {
    expect(isPipelineFilterDay("2026-05-20")).toBe(true)
    expect(isPipelineFilterDay("0001-01-01")).toBe(true)
    expect(isPipelineFilterDay("0000-01-01")).toBe(false)
    expect(isPipelineFilterDay("2026-02-30")).toBe(false)
  })

  test("date and datetime fields both take a YYYY-MM-DD operand", () => {
    for (const type of ["date", "datetime"] as const) {
      expect(
        pipelineFieldConditionError(type, {
          operator: "is",
          value: "0000-01-01",
        }),
      ).toBeDefined()
      expect(
        pipelineFieldConditionError(type, {
          operator: "is",
          value: "2026-05-20",
        }),
      ).toBeUndefined()
    }
  })
})
