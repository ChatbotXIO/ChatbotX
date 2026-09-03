import { describe, expect, test } from "vitest"
import { DELAY_UNITS } from "../src/features/sequences/lib/delay"
import { upsertSequenceStepRequest } from "../src/features/sequences/schema/action"

const BASE = {
  sequenceId: "1",
  order: 0,
}

const CONSISTENT_TRIPLES: Record<
  (typeof DELAY_UNITS)[number],
  { delayDays: number; delayMinutes: number }
> = {
  immediate: { delayDays: 0, delayMinutes: 0 },
  minutes: { delayDays: 0, delayMinutes: 5 },
  hours: { delayDays: 0, delayMinutes: 120 },
  days: { delayDays: 3, delayMinutes: 0 },
  specificTime: { delayDays: 0, delayMinutes: 0 },
}

describe("upsertSequenceStepRequest", () => {
  describe("consistent delayUnit/delayDays/delayMinutes triples", () => {
    for (const unit of DELAY_UNITS) {
      test(`passes for unit "${unit}"`, () => {
        const payload =
          unit === "specificTime"
            ? {
                ...BASE,
                delayUnit: unit,
                ...CONSISTENT_TRIPLES[unit],
                specificDateTime: "2026-09-10T10:00:00.000Z",
              }
            : {
                ...BASE,
                delayUnit: unit,
                ...CONSISTENT_TRIPLES[unit],
              }

        const result = upsertSequenceStepRequest.safeParse(payload)

        expect(result.success).toBe(true)
      })
    }
  })

  test("fails for days/0/120 (delayDays=0 but delayUnit=days requires delayMinutes=0)", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "days",
      delayDays: 0,
      delayMinutes: 120,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        (candidate) => candidate.path.join(".") === "delayUnit",
      )
      expect(issue?.message).toBe(
        "delayUnit does not match delayDays/delayMinutes",
      )
    }
  })

  test("fails for hours/0/90 (delayMinutes not a multiple of 60)", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "hours",
      delayDays: 0,
      delayMinutes: 90,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        (candidate) => candidate.path.join(".") === "delayUnit",
      )
      expect(issue?.message).toBe(
        "delayUnit does not match delayDays/delayMinutes",
      )
    }
  })

  test("fails for minutes/1/5 (delayDays must be 0 for minutes unit)", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "minutes",
      delayDays: 1,
      delayMinutes: 5,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        (candidate) => candidate.path.join(".") === "delayUnit",
      )
      expect(issue?.message).toBe(
        "delayUnit does not match delayDays/delayMinutes",
      )
    }
  })

  test("fails for hours/0/0 (zero relative value is not consistent)", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "hours",
      delayDays: 0,
      delayMinutes: 0,
    })

    expect(result.success).toBe(false)
  })

  test("fails for days/0/0 (zero relative value is not consistent)", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "days",
      delayDays: 0,
      delayMinutes: 0,
    })

    expect(result.success).toBe(false)
  })

  test("fails for minutes/0/0 (zero relative value is not consistent)", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "minutes",
      delayDays: 0,
      delayMinutes: 0,
    })

    expect(result.success).toBe(false)
  })

  test("passes for a partial payload with only delayDays", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayDays: 3,
    })

    expect(result.success).toBe(true)
  })

  test("passes for a partial payload with only delayUnit", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "hours",
    })

    expect(result.success).toBe(true)
  })

  test("fails when delayUnit is specificTime with a null specificDateTime", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "specificTime",
      delayDays: 0,
      delayMinutes: 0,
      specificDateTime: null,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        (candidate) => candidate.path.join(".") === "specificDateTime",
      )
      expect(issue).toBeDefined()
    }
  })

  test("passes when delayUnit is specificTime with an ISO specificDateTime", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "specificTime",
      delayDays: 0,
      delayMinutes: 0,
      specificDateTime: "2026-09-10T10:00:00.000Z",
    })

    expect(result.success).toBe(true)
  })

  test("accepts specificDateTime: null on a relative unit", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "days",
      delayDays: 3,
      delayMinutes: 0,
      specificDateTime: null,
    })

    expect(result.success).toBe(true)
  })

  test("fails for an invalid delayUnit value", () => {
    const result = upsertSequenceStepRequest.safeParse({
      ...BASE,
      delayUnit: "bogus",
      delayDays: 0,
      delayMinutes: 0,
    })

    expect(result.success).toBe(false)
  })
})
