import { describe, expect, test } from "vitest"
import {
  computeLatestOccurrence,
  computeNextOccurrence,
  computeNextSendable,
  findSlotOnDate,
  isExcludedSlot,
  listOccurrencesBetween,
  listUpcomingOccurrences,
  listUpcomingSlots,
  RECURRENCE_MAX_EXCLUDED_DATES,
  RECURRENCE_MAX_INTERVAL,
  type RecurrenceRule,
  recurrenceRuleSchema,
  recurrenceRuleShape,
  resolveZonedInstant,
  toLocalSlot,
} from "../src/recurrence"
import { canonicalizeTimezone, isValidTimezone } from "../src/timezone"

const base: RecurrenceRule = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "09:00",
  timezone: "Asia/Ho_Chi_Minh", // UTC+7, no DST
  startsOn: "2026-01-01",
  end: { kind: "never" },
}

const iso = (date: Date | null) => date?.toISOString() ?? null
const at = (value: string) => new Date(value)

describe("resolveZonedInstant (explicit DST policy)", () => {
  test("a nonexistent New York time shifts FORWARD past the gap", () => {
    expect(
      iso(resolveZonedInstant("2026-03-08", "02:30", "America/New_York")),
    ).toBe("2026-03-08T07:30:00.000Z") // 03:30 EDT
  })

  test("an ambiguous New York time takes the EARLIER instant", () => {
    expect(
      iso(resolveZonedInstant("2026-11-01", "01:30", "America/New_York")),
    ).toBe("2026-11-01T05:30:00.000Z") // first 01:30, EDT
  })

  test("London gap and overlap", () => {
    expect(
      iso(resolveZonedInstant("2026-03-29", "01:30", "Europe/London")),
    ).toBe(
      "2026-03-29T01:30:00.000Z", // 02:30 BST
    )
    expect(
      iso(resolveZonedInstant("2026-10-25", "01:30", "Europe/London")),
    ).toBe(
      "2026-10-25T00:30:00.000Z", // first 01:30, BST
    )
  })

  test("Lord Howe's 30-minute shift", () => {
    expect(
      iso(resolveZonedInstant("2026-10-04", "02:15", "Australia/Lord_Howe")),
    ).toBe("2026-10-03T15:45:00.000Z") // 02:45 local after a 30 min gap
  })

  test("a skipped whole day (Apia, 2011-12-30) moves to the next day", () => {
    expect(
      iso(resolveZonedInstant("2011-12-30", "12:00", "Pacific/Apia")),
    ).toBe(
      "2011-12-30T22:00:00.000Z", // 2011-12-31 12:00 local
    )
  })

  test("an ordinary time is unchanged", () => {
    expect(
      iso(resolveZonedInstant("2026-06-15", "09:00", "Asia/Ho_Chi_Minh")),
    ).toBe("2026-06-15T02:00:00.000Z")
  })
})

describe("daily", () => {
  test("next slot is the first strictly after `after`", () => {
    expect(
      iso(
        computeNextOccurrence(base, {
          after: at("2026-01-01T02:00:00.000Z"),
          occurrenceCount: 0,
        }),
      ),
    ).toBe("2026-01-02T02:00:00.000Z")
  })

  test("a start date in the future is the first slot", () => {
    expect(
      iso(
        computeNextOccurrence(
          { ...base, startsOn: "2026-03-01" },
          { after: at("2026-01-01T00:00:00.000Z"), occurrenceCount: 0 },
        ),
      ),
    ).toBe("2026-03-01T02:00:00.000Z")
  })

  test("interval N steps from the start date", () => {
    const rule = { ...base, interval: 3 }
    expect(
      listUpcomingOccurrences(rule, {
        after: at("2026-01-01T00:00:00.000Z"),
        occurrenceCount: 0,
        limit: 3,
      }).map(iso),
    ).toEqual([
      "2026-01-01T02:00:00.000Z",
      "2026-01-04T02:00:00.000Z",
      "2026-01-07T02:00:00.000Z",
    ])
  })

  test("a start years in the past still resolves in a single step", () => {
    expect(
      iso(
        computeNextOccurrence(
          { ...base, startsOn: "2000-01-01" },
          { after: at("2026-10-13T05:00:00.000Z"), occurrenceCount: 0 },
        ),
      ),
    ).toBe("2026-10-14T02:00:00.000Z")
  })
})

describe("weekly", () => {
  // 2026-10-12 is a Monday.
  const weekly: RecurrenceRule = {
    ...base,
    frequency: "weekly",
    weekdays: [1, 3], // Mon, Wed
    startsOn: "2026-10-12",
  }

  test("fires on every selected weekday", () => {
    expect(
      listUpcomingOccurrences(weekly, {
        after: at("2026-10-11T00:00:00.000Z"),
        occurrenceCount: 0,
        limit: 4,
      }).map(iso),
    ).toEqual([
      "2026-10-12T02:00:00.000Z",
      "2026-10-14T02:00:00.000Z",
      "2026-10-19T02:00:00.000Z",
      "2026-10-21T02:00:00.000Z",
    ])
  })

  test("interval 2 skips alternate ISO weeks", () => {
    expect(
      listUpcomingOccurrences(
        { ...weekly, interval: 2 },
        { after: at("2026-10-11T00:00:00.000Z"), occurrenceCount: 0, limit: 4 },
      ).map(iso),
    ).toEqual([
      "2026-10-12T02:00:00.000Z",
      "2026-10-14T02:00:00.000Z",
      "2026-10-26T02:00:00.000Z",
      "2026-10-28T02:00:00.000Z",
    ])
  })

  test("weekdays before startsOn in its own week are skipped", () => {
    // Start on a Wednesday: Monday of that week is before the start.
    expect(
      listUpcomingOccurrences(
        { ...weekly, startsOn: "2026-10-14" },
        { after: at("2026-10-01T00:00:00.000Z"), occurrenceCount: 0, limit: 2 },
      ).map(iso),
    ).toEqual(["2026-10-14T02:00:00.000Z", "2026-10-19T02:00:00.000Z"])
  })

  test("Sunday belongs to the preceding ISO week", () => {
    const rule = {
      ...weekly,
      weekdays: [0],
      interval: 2,
      startsOn: "2026-10-12",
    }
    // Week of Mon 10-12 → its Sunday is 10-18; next eligible week is 10-26 → Sunday 11-01.
    expect(
      listUpcomingOccurrences(rule, {
        after: at("2026-10-11T00:00:00.000Z"),
        occurrenceCount: 0,
        limit: 2,
      }).map(iso),
    ).toEqual(["2026-10-18T02:00:00.000Z", "2026-11-01T02:00:00.000Z"])
  })
})

describe("monthly", () => {
  const monthly: RecurrenceRule = {
    ...base,
    frequency: "monthly",
    monthDay: 31,
    startsOn: "2026-01-01",
  }

  test("day 31 clamps to the last day of shorter months", () => {
    expect(
      listUpcomingOccurrences(monthly, {
        after: at("2026-01-01T00:00:00.000Z"),
        occurrenceCount: 0,
        limit: 4,
      }).map((date) => toLocalSlot(date as Date, base.timezone)),
    ).toEqual([
      "2026-01-31 09:00",
      "2026-02-28 09:00",
      "2026-03-31 09:00",
      "2026-04-30 09:00",
    ])
  })

  test('"last" is always the last day, including leap February', () => {
    expect(
      listUpcomingOccurrences(
        { ...monthly, monthDay: "last", startsOn: "2028-02-01" },
        { after: at("2028-02-01T00:00:00.000Z"), occurrenceCount: 0, limit: 2 },
      ).map((date) => toLocalSlot(date, base.timezone)),
    ).toEqual(["2028-02-29 09:00", "2028-03-31 09:00"])
  })

  test("interval 24 months is still found (no search horizon)", () => {
    const rule = {
      ...monthly,
      interval: RECURRENCE_MAX_INTERVAL.monthly,
      monthDay: 15,
    }
    const next = computeNextOccurrence(rule, {
      after: at("2026-01-16T00:00:00.000Z"),
      occurrenceCount: 1,
    })
    expect(toLocalSlot(next as Date, base.timezone)).toBe("2028-01-15 09:00")
  })
})

describe("end conditions", () => {
  test("onDate is inclusive", () => {
    const rule: RecurrenceRule = {
      ...base,
      end: { kind: "onDate", date: "2026-01-03" },
    }
    const slots = listUpcomingOccurrences(rule, {
      after: at("2025-12-31T00:00:00.000Z"),
      occurrenceCount: 0,
      limit: 10,
    })
    expect(slots.map((date) => toLocalSlot(date, base.timezone))).toEqual([
      "2026-01-01 09:00",
      "2026-01-02 09:00",
      "2026-01-03 09:00",
    ])
  })

  test("afterOccurrences counts the lifetime materialized total", () => {
    const rule: RecurrenceRule = {
      ...base,
      end: { kind: "afterOccurrences", count: 2 },
    }
    expect(
      computeNextOccurrence(rule, {
        after: at("2026-01-01T00:00:00.000Z"),
        occurrenceCount: 1,
      }),
    ).not.toBeNull()
    expect(
      computeNextOccurrence(rule, {
        after: at("2026-01-01T00:00:00.000Z"),
        occurrenceCount: 2,
      }),
    ).toBeNull()
  })
})

describe("computeLatestOccurrence (catch-up)", () => {
  test("returns the latest slot at or before now, decades after the start", () => {
    const rule = { ...base, startsOn: "1990-01-01" }
    expect(
      iso(
        computeLatestOccurrence(rule, {
          atOrBefore: at("2026-10-13T05:00:00.000Z"),
          occurrenceCount: 0,
        }),
      ),
    ).toBe("2026-10-13T02:00:00.000Z")
  })

  test("before the first slot there is nothing to catch up", () => {
    expect(
      computeLatestOccurrence(
        { ...base, startsOn: "2027-01-01" },
        { atOrBefore: at("2026-10-13T00:00:00.000Z"), occurrenceCount: 0 },
      ),
    ).toBeNull()
  })

  test("never goes past an end date", () => {
    const rule: RecurrenceRule = {
      ...base,
      end: { kind: "onDate", date: "2026-01-05" },
    }
    expect(
      iso(
        computeLatestOccurrence(rule, {
          atOrBefore: at("2026-06-01T00:00:00.000Z"),
          occurrenceCount: 0,
        }),
      ),
    ).toBe("2026-01-05T02:00:00.000Z")
  })

  test("an end date decades before now still resolves its last slot", () => {
    const rule: RecurrenceRule = {
      ...base,
      startsOn: "1990-01-01",
      end: { kind: "onDate", date: "1995-01-01" },
    }
    expect(
      iso(
        computeLatestOccurrence(rule, {
          atOrBefore: at("2026-10-13T05:00:00.000Z"),
          occurrenceCount: 0,
        }),
      ),
    ).toBe("1995-01-01T02:00:00.000Z")
  })

  test("weekly picks the latest selected weekday", () => {
    const rule: RecurrenceRule = {
      ...base,
      frequency: "weekly",
      weekdays: [1, 3],
      startsOn: "2026-10-12",
    }
    expect(
      iso(
        computeLatestOccurrence(rule, {
          atOrBefore: at("2026-10-17T00:00:00.000Z"), // Saturday
          occurrenceCount: 0,
        }),
      ),
    ).toBe("2026-10-14T02:00:00.000Z") // Wednesday
  })
})

describe("listOccurrencesBetween", () => {
  test("lists the slots in (after, through], oldest first", () => {
    expect(
      listOccurrencesBetween(base, {
        after: at("2026-01-01T02:00:00.000Z"),
        through: at("2026-01-04T02:00:00.000Z"),
        occurrenceCount: 0,
        limit: 10,
      }).map(iso),
    ).toEqual([
      "2026-01-02T02:00:00.000Z",
      "2026-01-03T02:00:00.000Z",
      "2026-01-04T02:00:00.000Z",
    ])
  })

  test("honours the limit and an empty range", () => {
    expect(
      listOccurrencesBetween(base, {
        after: at("2026-01-01T00:00:00.000Z"),
        through: at("2026-12-31T00:00:00.000Z"),
        occurrenceCount: 0,
        limit: 2,
      }),
    ).toHaveLength(2)
    expect(
      listOccurrencesBetween(base, {
        after: at("2026-01-02T02:00:00.000Z"),
        through: at("2026-01-02T03:00:00.000Z"),
        occurrenceCount: 0,
        limit: 5,
      }),
    ).toEqual([])
  })
})

describe("DST + series", () => {
  test("a daily 02:30 New York series moves forward on the gap day only", () => {
    const rule: RecurrenceRule = {
      ...base,
      timezone: "America/New_York",
      timeOfDay: "02:30",
      startsOn: "2026-03-07",
    }
    expect(
      listUpcomingOccurrences(rule, {
        after: at("2026-03-06T00:00:00.000Z"),
        occurrenceCount: 0,
        limit: 3,
      }).map(iso),
    ).toEqual([
      "2026-03-07T07:30:00.000Z", // 02:30 EST
      "2026-03-08T07:30:00.000Z", // 03:30 EDT (gap)
      "2026-03-09T06:30:00.000Z", // 02:30 EDT
    ])
  })
})

describe("DST inside a series", () => {
  const series = (rule: RecurrenceRule, after: string, limit: number) =>
    listUpcomingOccurrences(rule, {
      after: at(after),
      occurrenceCount: 0,
      limit,
    }).map(iso)

  test("an overlap day yields one slot at the earlier instant, no duplicate", () => {
    expect(
      series(
        {
          ...base,
          timezone: "America/New_York",
          timeOfDay: "01:30",
          startsOn: "2026-10-30",
        },
        "2026-10-29T00:00:00.000Z",
        4,
      ),
    ).toEqual([
      "2026-10-30T05:30:00.000Z",
      "2026-10-31T05:30:00.000Z",
      "2026-11-01T05:30:00.000Z",
      "2026-11-02T06:30:00.000Z",
    ])
  })

  test("a skipped whole day (Apia) shifts that slot to the next day, nothing is lost", () => {
    expect(
      series(
        {
          ...base,
          timezone: "Pacific/Apia",
          timeOfDay: "12:00",
          startsOn: "2011-12-28",
        },
        "2011-12-27T00:00:00.000Z",
        4,
      ),
    ).toEqual([
      "2011-12-28T22:00:00.000Z",
      "2011-12-29T22:00:00.000Z",
      "2011-12-30T22:00:00.000Z",
      "2011-12-31T22:00:00.000Z",
    ])
  })
})

describe("maximum intervals", () => {
  test("daily at its cap steps exactly that many days", () => {
    const rule = { ...base, interval: RECURRENCE_MAX_INTERVAL.daily }
    const [first, second] = listUpcomingOccurrences(rule, {
      after: at("2025-12-31T00:00:00.000Z"),
      occurrenceCount: 0,
      limit: 2,
    })
    expect((second.getTime() - first.getTime()) / 86_400_000).toBe(365)
  })

  test("weekly at its cap skips 51 weeks between active weeks", () => {
    const rule: RecurrenceRule = {
      ...base,
      frequency: "weekly",
      weekdays: [6, 0], // Sat, Sun
      interval: RECURRENCE_MAX_INTERVAL.weekly,
      startsOn: "2026-10-12",
    }
    expect(
      listUpcomingOccurrences(rule, {
        after: at("2026-10-11T00:00:00.000Z"),
        occurrenceCount: 0,
        limit: 4,
      }).map(iso),
    ).toEqual([
      "2026-10-17T02:00:00.000Z",
      "2026-10-18T02:00:00.000Z",
      "2027-10-16T02:00:00.000Z",
      "2027-10-17T02:00:00.000Z",
    ])
  })
})

describe("recurrenceRuleSchema", () => {
  const issuesOf = (rule: unknown) => {
    const result = recurrenceRuleSchema.safeParse(rule)
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."))
  }

  test("accepts a valid rule", () => {
    expect(recurrenceRuleSchema.safeParse(base).success).toBe(true)
  })

  test("rejects an offset timezone, an unknown zone and a fake date", () => {
    expect(issuesOf({ ...base, timezone: "+07:00" })).toContain("timezone")
    expect(issuesOf({ ...base, timezone: "Mars/Olympus" })).toContain(
      "timezone",
    )
    expect(issuesOf({ ...base, startsOn: "2026-02-31" })).toContain("startsOn")
  })

  test("weekly requires weekdays and monthly requires monthDay", () => {
    expect(issuesOf({ ...base, frequency: "weekly" })).toContain("weekdays")
    expect(issuesOf({ ...base, frequency: "monthly" })).toContain("monthDay")
  })

  test("rejects an end date before the start and an over-cap interval", () => {
    expect(
      issuesOf({ ...base, end: { kind: "onDate", date: "2025-12-31" } }),
    ).toContain("end.date")
    expect(
      issuesOf({ ...base, interval: RECURRENCE_MAX_INTERVAL.daily + 1 }),
    ).toContain("interval")
  })

  test("the unrefined shape still parses a rule the schema rejects", () => {
    const stale = { ...base, timezone: "Mars/Olympus" }
    expect(recurrenceRuleSchema.safeParse(stale).success).toBe(false)
    expect(recurrenceRuleShape.safeParse(stale).success).toBe(true)
  })
})

describe("timezone helpers", () => {
  test("canonicalizes legacy names and validates strictly", () => {
    expect(canonicalizeTimezone("Asia/Saigon")).toBe("Asia/Ho_Chi_Minh")
    expect(canonicalizeTimezone("Europe/London")).toBe("Europe/London")
    expect(isValidTimezone("Asia/Saigon")).toBe(true)
    expect(isValidTimezone("UTC")).toBe(true)
    expect(isValidTimezone("+07:00")).toBe(false)
    // Listed as an alias but not a zone the runtime can format with.
    expect(isValidTimezone("US")).toBe(false)
  })
})

describe("excludeDates", () => {
  const skipping = (excludeDates: string[]): RecurrenceRule => ({
    ...base,
    excludeDates,
  })

  test("the slot of an excluded date is flagged but still generated", () => {
    const rule = skipping(["2026-01-02"])
    // Cursor math is unfiltered so the worker can still settle the skipped slot.
    expect(
      iso(
        computeNextOccurrence(rule, {
          after: at("2026-01-01T03:00:00Z"),
          occurrenceCount: 0,
        }),
      ),
    ).toBe("2026-01-02T02:00:00.000Z")
    expect(isExcludedSlot(rule, at("2026-01-02T02:00:00Z"))).toBe(true)
    expect(isExcludedSlot(rule, at("2026-01-03T02:00:00Z"))).toBe(false)
    expect(isExcludedSlot(base, at("2026-01-02T02:00:00Z"))).toBe(false)
  })

  test("sendable previews skip the date; slot previews flag it", () => {
    const rule = skipping(["2026-01-02"])
    const input = {
      after: at("2026-01-01T00:00:00Z"),
      occurrenceCount: 0,
      limit: 3,
    }
    expect(listUpcomingOccurrences(rule, input).map(iso)).toEqual([
      "2026-01-01T02:00:00.000Z",
      "2026-01-03T02:00:00.000Z",
      "2026-01-04T02:00:00.000Z",
    ])
    expect(
      listUpcomingSlots(rule, input).map(({ date, excluded }) => [
        date,
        excluded,
      ]),
    ).toEqual([
      ["2026-01-01", false],
      ["2026-01-02", true],
      ["2026-01-03", false],
    ])
  })

  test("skipped slots do not consume afterOccurrences", () => {
    const rule: RecurrenceRule = {
      ...skipping(["2026-01-02"]),
      end: { kind: "afterOccurrences", count: 2 },
    }
    expect(
      listUpcomingOccurrences(rule, {
        after: at("2026-01-01T00:00:00Z"),
        occurrenceCount: 0,
        limit: 5,
      }).map(iso),
    ).toEqual(["2026-01-01T02:00:00.000Z", "2026-01-03T02:00:00.000Z"])
  })

  test("a weekly skip leaves the other weekdays alone", () => {
    const rule: RecurrenceRule = {
      ...base,
      frequency: "weekly",
      weekdays: [1, 3],
      startsOn: "2026-01-05",
      excludeDates: ["2026-01-07"],
    }
    expect(
      listUpcomingOccurrences(rule, {
        after: at("2026-01-04T00:00:00Z"),
        occurrenceCount: 0,
        limit: 3,
      }).map(iso),
    ).toEqual([
      "2026-01-05T02:00:00.000Z",
      "2026-01-12T02:00:00.000Z",
      "2026-01-14T02:00:00.000Z",
    ])
  })

  test("a clamped monthly slot is excluded by the date it lands on", () => {
    const rule: RecurrenceRule = {
      ...base,
      frequency: "monthly",
      monthDay: 31,
      startsOn: "2026-01-31",
      excludeDates: ["2026-02-28"],
    }
    const slots = listUpcomingSlots(rule, {
      after: at("2026-01-30T00:00:00Z"),
      occurrenceCount: 0,
      limit: 3,
    })
    expect(slots.map(({ date, excluded }) => [date, excluded])).toEqual([
      ["2026-01-31", false],
      ["2026-02-28", true],
      ["2026-03-31", false],
    ])
  })

  test("a DST-shifted slot is excluded by its resolved local date", () => {
    const rule: RecurrenceRule = {
      ...base,
      timezone: "America/New_York",
      timeOfDay: "02:30",
      startsOn: "2026-03-07",
      excludeDates: ["2026-03-08"],
    }
    const [, shifted] = listUpcomingSlots(rule, {
      after: at("2026-03-07T00:00:00Z"),
      occurrenceCount: 0,
      limit: 2,
    })
    expect(iso(shifted.at)).toBe("2026-03-08T07:30:00.000Z")
    expect(shifted.excluded).toBe(true)
  })

  test("computeNextSendable walks past consecutive skipped slots", () => {
    const rule = skipping(["2026-01-02", "2026-01-03"])
    expect(
      iso(
        computeNextSendable(rule, {
          from: at("2026-01-02T02:00:00Z"),
          occurrenceCount: 0,
        }),
      ),
    ).toBe("2026-01-04T02:00:00.000Z")
    expect(
      iso(
        computeNextSendable(rule, {
          from: at("2026-01-01T02:00:00Z"),
          occurrenceCount: 0,
        }),
      ),
    ).toBe("2026-01-01T02:00:00.000Z")
  })

  test("computeNextSendable is null when only skipped slots remain", () => {
    const rule: RecurrenceRule = {
      ...skipping(["2026-01-02", "2026-01-03"]),
      end: { kind: "onDate", date: "2026-01-03" },
    }
    expect(
      computeNextSendable(rule, {
        from: at("2026-01-02T02:00:00Z"),
        occurrenceCount: 0,
      }),
    ).toBeNull()
  })

  test("findSlotOnDate returns the slot only on dates the rule runs", () => {
    const rule: RecurrenceRule = {
      ...base,
      frequency: "weekly",
      weekdays: [1],
      startsOn: "2026-01-05",
    }
    expect(
      iso(findSlotOnDate(rule, { date: "2026-01-12", occurrenceCount: 0 })),
    ).toBe("2026-01-12T02:00:00.000Z")
    expect(
      findSlotOnDate(rule, { date: "2026-01-13", occurrenceCount: 0 }),
    ).toBeNull()
    expect(
      findSlotOnDate(rule, { date: "2025-12-29", occurrenceCount: 0 }),
    ).toBeNull()
  })

  test("findSlotOnDate respects the end conditions", () => {
    expect(
      findSlotOnDate(
        { ...base, end: { kind: "onDate", date: "2026-01-10" } },
        { date: "2026-01-11", occurrenceCount: 0 },
      ),
    ).toBeNull()
    expect(
      findSlotOnDate(
        { ...base, end: { kind: "afterOccurrences", count: 3 } },
        { date: "2026-01-05", occurrenceCount: 3 },
      ),
    ).toBeNull()
  })

  test("schema rejects non-real dates and more than the cap", () => {
    const bad = recurrenceRuleSchema.safeParse(skipping(["2026-02-30"]))
    expect(bad.success).toBe(false)
    const tooMany = recurrenceRuleSchema.safeParse(
      skipping(
        Array.from({ length: RECURRENCE_MAX_EXCLUDED_DATES + 1 }, (_, index) =>
          new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
        ),
      ),
    )
    expect(tooMany.success).toBe(false)
    expect(
      recurrenceRuleSchema.safeParse(skipping(["2026-12-25"])).success,
    ).toBe(true)
    expect(recurrenceRuleSchema.safeParse(base).success).toBe(true)
  })
})
