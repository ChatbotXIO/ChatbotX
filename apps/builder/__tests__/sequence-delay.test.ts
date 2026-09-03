import { describe, expect, test } from "vitest"
import {
  delayViewToStored,
  isDelayUnit,
  isDelayValueInRange,
  isStoredDelayConsistent,
  MAX_DELAY_VALUE,
  MIN_DELAY_VALUE,
  oneHourFromNowLocal,
  type StoredDelay,
  type StoredDelayFields,
  stepToDelayView,
  toLocalDateTimeInputValue,
} from "../src/features/sequences/lib/delay"

describe("isDelayUnit", () => {
  test("accepts every DelayUnit value", () => {
    expect(isDelayUnit("immediate")).toBe(true)
    expect(isDelayUnit("minutes")).toBe(true)
    expect(isDelayUnit("hours")).toBe(true)
    expect(isDelayUnit("days")).toBe(true)
    expect(isDelayUnit("specificTime")).toBe(true)
  })

  test("rejects values outside the DelayUnit enum", () => {
    expect(isDelayUnit("bogus")).toBe(false)
    expect(isDelayUnit(null)).toBe(false)
    expect(isDelayUnit(undefined)).toBe(false)
    expect(isDelayUnit(1)).toBe(false)
  })
})

describe("isDelayValueInRange", () => {
  test("rejects 0", () => {
    expect(isDelayValueInRange(0)).toBe(false)
  })

  test("accepts the minimum value", () => {
    expect(isDelayValueInRange(MIN_DELAY_VALUE)).toBe(true)
  })

  test("accepts the maximum value", () => {
    expect(isDelayValueInRange(MAX_DELAY_VALUE)).toBe(true)
  })

  test("rejects a value above the maximum", () => {
    expect(isDelayValueInRange(100_000)).toBe(false)
  })

  test("rejects non-integer values", () => {
    expect(isDelayValueInRange(1.5)).toBe(false)
  })

  test("rejects NaN", () => {
    expect(isDelayValueInRange(Number.NaN)).toBe(false)
  })
})

describe("isStoredDelayConsistent", () => {
  test("immediate: 0/0 is consistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 0,
        delayMinutes: 0,
        delayUnit: "immediate",
      }),
    ).toBe(true)
  })

  test("immediate: nonzero days is inconsistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 1,
        delayMinutes: 0,
        delayUnit: "immediate",
      }),
    ).toBe(false)
  })

  test("immediate: nonzero minutes is inconsistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 0,
        delayMinutes: 1,
        delayUnit: "immediate",
      }),
    ).toBe(false)
  })

  test("minutes: days = 0 with any minutes is consistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 0,
        delayMinutes: 90,
        delayUnit: "minutes",
      }),
    ).toBe(true)
    expect(
      isStoredDelayConsistent({
        delayDays: 0,
        delayMinutes: 0,
        delayUnit: "minutes",
      }),
    ).toBe(true)
  })

  test("minutes: nonzero days is inconsistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 1,
        delayMinutes: 30,
        delayUnit: "minutes",
      }),
    ).toBe(false)
  })

  test("hours: days = 0 and minutes % 60 = 0 is consistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 0,
        delayMinutes: 120,
        delayUnit: "hours",
      }),
    ).toBe(true)
  })

  test("hours: minutes not a multiple of 60 is inconsistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 0,
        delayMinutes: 90,
        delayUnit: "hours",
      }),
    ).toBe(false)
  })

  test("hours: nonzero days is inconsistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 1,
        delayMinutes: 60,
        delayUnit: "hours",
      }),
    ).toBe(false)
  })

  test("days: minutes = 0 is consistent regardless of days", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 120,
        delayMinutes: 0,
        delayUnit: "days",
      }),
    ).toBe(true)
  })

  test("days: nonzero minutes is inconsistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 3,
        delayMinutes: 1,
        delayUnit: "days",
      }),
    ).toBe(false)
  })

  test("specificTime: 0/0 is consistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 0,
        delayMinutes: 0,
        delayUnit: "specificTime",
      }),
    ).toBe(true)
  })

  test("specificTime: nonzero days or minutes is inconsistent", () => {
    expect(
      isStoredDelayConsistent({
        delayDays: 1,
        delayMinutes: 0,
        delayUnit: "specificTime",
      }),
    ).toBe(false)
    expect(
      isStoredDelayConsistent({
        delayDays: 0,
        delayMinutes: 1,
        delayUnit: "specificTime",
      }),
    ).toBe(false)
  })
})

describe("toLocalDateTimeInputValue", () => {
  test("formats a date as zero-padded local YYYY-MM-DDTHH:mm", () => {
    expect(toLocalDateTimeInputValue(new Date(2026, 0, 5, 7, 3))).toBe(
      "2026-01-05T07:03",
    )
  })
})

describe("oneHourFromNowLocal", () => {
  test("matches toLocalDateTimeInputValue(now + 1h)", () => {
    const before = new Date()
    before.setHours(before.getHours() + 1)
    const result = oneHourFromNowLocal()
    const after = new Date()
    after.setHours(after.getHours() + 1)

    expect(result >= toLocalDateTimeInputValue(before)).toBe(true)
    expect(result <= toLocalDateTimeInputValue(after)).toBe(true)
  })
})

describe("stepToDelayView", () => {
  test("undefined step defaults to days/1", () => {
    expect(stepToDelayView(undefined)).toEqual({
      unit: "days",
      value: 1,
      specificDateTime: "",
    })
  })

  test("stored {0, 120, 'minutes'} keeps minutes/120 (does not upconvert to hours)", () => {
    expect(
      stepToDelayView({
        delayDays: 0,
        delayMinutes: 120,
        delayUnit: "minutes",
      }),
    ).toEqual({ unit: "minutes", value: 120, specificDateTime: "" })
  })

  test("stored {0, 120, 'hours'} yields hours/2", () => {
    expect(
      stepToDelayView({
        delayDays: 0,
        delayMinutes: 120,
        delayUnit: "hours",
      }),
    ).toEqual({ unit: "hours", value: 2, specificDateTime: "" })
  })

  test("stored {0, 90, 'hours'} is inconsistent, infers minutes/90", () => {
    expect(
      stepToDelayView({
        delayDays: 0,
        delayMinutes: 90,
        delayUnit: "hours",
      }),
    ).toEqual({ unit: "minutes", value: 90, specificDateTime: "" })
  })

  test("stored {0, 90, null} infers minutes/90", () => {
    expect(
      stepToDelayView({ delayDays: 0, delayMinutes: 90, delayUnit: null }),
    ).toEqual({ unit: "minutes", value: 90, specificDateTime: "" })
  })

  test("stored {0, 120, null} infers hours/2", () => {
    expect(
      stepToDelayView({ delayDays: 0, delayMinutes: 120, delayUnit: null }),
    ).toEqual({ unit: "hours", value: 2, specificDateTime: "" })
  })

  test("stored {3, 0, null} infers days/3", () => {
    expect(
      stepToDelayView({ delayDays: 3, delayMinutes: 0, delayUnit: null }),
    ).toEqual({ unit: "days", value: 3, specificDateTime: "" })
  })

  test("stored {1, 30, null} infers minutes/1470", () => {
    expect(
      stepToDelayView({ delayDays: 1, delayMinutes: 30, delayUnit: null }),
    ).toEqual({ unit: "minutes", value: 1470, specificDateTime: "" })
  })

  test("stored {0, 0, null} infers immediate/1", () => {
    expect(
      stepToDelayView({ delayDays: 0, delayMinutes: 0, delayUnit: null }),
    ).toEqual({ unit: "immediate", value: 1, specificDateTime: "" })
  })

  test("stored {120, 0, 'days'} is accepted (consistent), yields days/120", () => {
    expect(
      stepToDelayView({
        delayDays: 120,
        delayMinutes: 0,
        delayUnit: "days",
      }),
    ).toEqual({ unit: "days", value: 120, specificDateTime: "" })
  })

  test("stored {0, 0, 'minutes'} - zero relative value not accepted, falls back to immediate/1", () => {
    expect(
      stepToDelayView({
        delayDays: 0,
        delayMinutes: 0,
        delayUnit: "minutes",
      }),
    ).toEqual({ unit: "immediate", value: 1, specificDateTime: "" })
  })

  test("stored {0, 0, 'specificTime', specificDateTime: Date} yields specificTime with formatted local date", () => {
    const specificDateTime = new Date(2026, 5, 15, 9, 30)
    expect(
      stepToDelayView({
        delayDays: 0,
        delayMinutes: 0,
        delayUnit: "specificTime",
        specificDateTime,
      }),
    ).toEqual({
      unit: "specificTime",
      value: 1,
      specificDateTime: "2026-06-15T09:30",
    })
  })

  test("stored {0, 0, 'specificTime', specificDateTime: null} falls back to immediate/1", () => {
    expect(
      stepToDelayView({
        delayDays: 0,
        delayMinutes: 0,
        delayUnit: "specificTime",
        specificDateTime: null,
      }),
    ).toEqual({ unit: "immediate", value: 1, specificDateTime: "" })
  })

  test("stored {0, 0, 'bogus'} falls back to immediate/1", () => {
    expect(
      stepToDelayView({ delayDays: 0, delayMinutes: 0, delayUnit: "bogus" }),
    ).toEqual({ unit: "immediate", value: 1, specificDateTime: "" })
  })

  test("stored {-1, 0, 'days'} (negative, consistent but non-positive value) falls back to immediate/1", () => {
    expect(
      stepToDelayView({ delayDays: -1, delayMinutes: 0, delayUnit: "days" }),
    ).toEqual({ unit: "immediate", value: 1, specificDateTime: "" })
  })

  test("stored {0, -30, 'minutes'} (negative, consistent but non-positive value) falls back to immediate/1", () => {
    expect(
      stepToDelayView({
        delayDays: 0,
        delayMinutes: -30,
        delayUnit: "minutes",
      }),
    ).toEqual({ unit: "immediate", value: 1, specificDateTime: "" })
  })

  test("stored {0, NaN, 'minutes'} (consistent but NaN value) falls back to immediate/1", () => {
    expect(
      stepToDelayView({
        delayDays: 0,
        delayMinutes: Number.NaN,
        delayUnit: "minutes",
      }),
    ).toEqual({ unit: "immediate", value: 1, specificDateTime: "" })
  })

  test("previously chosen specificDateTime is shown even when unit is not specificTime", () => {
    const specificDateTime = new Date(2026, 2, 1, 12, 0)
    expect(
      stepToDelayView({
        delayDays: 2,
        delayMinutes: 0,
        delayUnit: "days",
        specificDateTime,
      }),
    ).toEqual({
      unit: "days",
      value: 2,
      specificDateTime: "2026-03-01T12:00",
    })
  })
})

describe("round trip via delayViewToStored -> stepToDelayView", () => {
  function toStepFields(stored: StoredDelay): StoredDelayFields {
    return {
      delayDays: stored.delayDays,
      delayMinutes: stored.delayMinutes,
      delayUnit: stored.delayUnit,
    }
  }

  test("days(2)", () => {
    const stored = delayViewToStored({ unit: "days", value: 2 })
    expect(stepToDelayView(toStepFields(stored))).toEqual({
      unit: "days",
      value: 2,
      specificDateTime: "",
    })
  })

  test("hours(2)", () => {
    const stored = delayViewToStored({ unit: "hours", value: 2 })
    expect(stepToDelayView(toStepFields(stored))).toEqual({
      unit: "hours",
      value: 2,
      specificDateTime: "",
    })
  })

  test("minutes(30)", () => {
    const stored = delayViewToStored({ unit: "minutes", value: 30 })
    expect(stepToDelayView(toStepFields(stored))).toEqual({
      unit: "minutes",
      value: 30,
      specificDateTime: "",
    })
  })

  test("immediate", () => {
    const stored = delayViewToStored({ unit: "immediate", value: 1 })
    expect(stepToDelayView(toStepFields(stored))).toEqual({
      unit: "immediate",
      value: 1,
      specificDateTime: "",
    })
  })
})

describe("delayViewToStored", () => {
  test("days", () => {
    expect(delayViewToStored({ unit: "days", value: 5 })).toEqual({
      delayDays: 5,
      delayMinutes: 0,
      delayUnit: "days",
      specificDateTime: null,
    })
  })

  test("hours", () => {
    expect(delayViewToStored({ unit: "hours", value: 3 })).toEqual({
      delayDays: 0,
      delayMinutes: 180,
      delayUnit: "hours",
      specificDateTime: null,
    })
  })

  test("minutes", () => {
    expect(delayViewToStored({ unit: "minutes", value: 45 })).toEqual({
      delayDays: 0,
      delayMinutes: 45,
      delayUnit: "minutes",
      specificDateTime: null,
    })
  })

  test("immediate", () => {
    expect(delayViewToStored({ unit: "immediate", value: 1 })).toEqual({
      delayDays: 0,
      delayMinutes: 0,
      delayUnit: "immediate",
      specificDateTime: null,
    })
  })

  test("specificTime passes through the ISO string", () => {
    expect(
      delayViewToStored({
        unit: "specificTime",
        value: 1,
        specificDateTimeIso: "2026-06-15T09:30:00.000Z",
      }),
    ).toEqual({
      delayDays: 0,
      delayMinutes: 0,
      delayUnit: "specificTime",
      specificDateTime: "2026-06-15T09:30:00.000Z",
    })
  })

  test("specificTime with no ISO string stores null", () => {
    expect(delayViewToStored({ unit: "specificTime", value: 1 })).toEqual({
      delayDays: 0,
      delayMinutes: 0,
      delayUnit: "specificTime",
      specificDateTime: null,
    })
  })

  test("relative units always store null specificDateTime even if provided", () => {
    expect(
      delayViewToStored({
        unit: "days",
        value: 1,
        specificDateTimeIso: "2026-06-15T09:30:00.000Z",
      }),
    ).toEqual({
      delayDays: 1,
      delayMinutes: 0,
      delayUnit: "days",
      specificDateTime: null,
    })
  })
})
