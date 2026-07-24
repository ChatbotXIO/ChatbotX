import type { DatabaseClient } from "@chatbotx.io/database/client"
import { describe, expect, test, vi } from "vitest"
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
} from "../src/contact-custom-field"

describe("contact custom field normalization", () => {
  test("normalizes naive temporal values using the source timezone", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "2026-07-22",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("2026-07-22T00:00:00+07:00")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "2026-07-22 15:30",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("2026-07-22T08:30:00.000Z")
  })

  test("returns null (not the raw value) when a temporal value can't be normalized", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    // Impossible calendar date and a garbage string must both skip storage
    // rather than persist an un-normalized value the rest of the system reads
    // as UTC ISO.
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "2026-02-30",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBeNull()

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "not-a-date",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBeNull()
  })

  test("passes non-temporal values through unchanged", async () => {
    const resolver = vi.fn(async () => "Asia/Ho_Chi_Minh")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "shortText",
        value: "hello world",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("hello world")
    // Non-temporal types must not incur a timezone lookup.
    expect(resolver).not.toHaveBeenCalled()
  })

  test("passes through explicit offsets without reinterpreting them", async () => {
    const resolver = vi.fn(async () => "Asia/Ho_Chi_Minh")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "2026-07-22T15:30:00+07:00",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("2026-07-22T08:30:00.000Z")
    expect(resolver).not.toHaveBeenCalled()
  })

  test("resolves the source timezone once and prefers contact over workspace", async () => {
    const contactFindFirst = vi
      .fn()
      .mockResolvedValue({ timezone: "Asia/Tokyo" })
    const workspaceFindFirst = vi
      .fn()
      .mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
    const tx = {
      query: {
        contactModel: {
          findFirst: contactFindFirst,
        },
        workspaceModel: {
          findFirst: workspaceFindFirst,
        },
      },
    } as unknown as DatabaseClient

    const resolver = createSourceTimezoneResolver({
      workspaceId: "1",
      contactId: "2",
      tx,
    })

    await expect(resolver()).resolves.toBe("Asia/Tokyo")
    await expect(resolver()).resolves.toBe("Asia/Tokyo")
    expect(contactFindFirst).toHaveBeenCalledTimes(1)
    expect(workspaceFindFirst).toHaveBeenCalledTimes(1)
  })

  test("falls back to the workspace timezone when the contact has none", async () => {
    const tx = {
      query: {
        contactModel: {
          // Contact row present but with no usable timezone.
          findFirst: vi.fn().mockResolvedValue({ timezone: null }),
        },
        workspaceModel: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" }),
        },
      },
    } as unknown as DatabaseClient

    const resolver = createSourceTimezoneResolver({
      workspaceId: "1",
      contactId: "2",
      tx,
    })

    await expect(resolver()).resolves.toBe("Asia/Ho_Chi_Minh")
  })

  test("defaults to UTC when neither contact nor workspace has a usable timezone", async () => {
    const tx = {
      query: {
        contactModel: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
        workspaceModel: {
          findFirst: vi.fn().mockResolvedValue({ timezone: null }),
        },
      },
    } as unknown as DatabaseClient

    const resolver = createSourceTimezoneResolver({
      workspaceId: "1",
      contactId: "2",
      tx,
    })

    await expect(resolver()).resolves.toBe("UTC")
  })

  test("anchors a date to the explicit client timezone without consulting the resolver", async () => {
    // A date honors the submitter's browser zone: the calendar day is local to
    // them, so it stores offset-preserved in that zone and never touches the
    // contact/workspace fallback.
    const resolveSourceTimezone = vi.fn(async () => "Asia/Tokyo")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "2026-07-22",
        resolveSourceTimezone,
        explicitTimezone: "America/New_York",
      }),
    ).resolves.toBe("2026-07-22T00:00:00-04:00")
    expect(resolveSourceTimezone).not.toHaveBeenCalled()
  })

  test("ignores the explicit client timezone for a naive datetime and uses the resolver", async () => {
    // A datetime is an absolute instant: its stored UTC moment must not drift
    // with the submitter's browser, so the explicit zone is ignored and the
    // contact/workspace resolver anchors it instead (UTC+7 here, not the
    // browser's UTC-4).
    const resolveSourceTimezone = vi.fn(async () => "Asia/Ho_Chi_Minh")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "2026-07-22 15:30",
        resolveSourceTimezone,
        explicitTimezone: "America/New_York",
      }),
    ).resolves.toBe("2026-07-22T08:30:00.000Z")
    expect(resolveSourceTimezone).toHaveBeenCalledTimes(1)
  })

  test("falls back to the resolver when a date's explicit client timezone is blank", async () => {
    const resolveSourceTimezone = vi.fn(async () => "Asia/Tokyo")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "2026-07-22",
        resolveSourceTimezone,
        explicitTimezone: "   ",
      }),
    ).resolves.toBe("2026-07-22T00:00:00+09:00")
    expect(resolveSourceTimezone).toHaveBeenCalledTimes(1)
  })
})

describe("lenient temporal parsing and workspace strategy", () => {
  test("lenient mode parses a DMY datetime and anchors it to the source zone", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "23/07/2026 09:30",
        resolveSourceTimezone: resolver,
        temporalInputParsing: "lenient",
      }),
    ).resolves.toBe("2026-07-23T02:30:00.000Z")
  })

  test("lenient mode parses a DMY date offset-preserved in the source zone", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "23/07/2026",
        resolveSourceTimezone: resolver,
        temporalInputParsing: "lenient",
      }),
    ).resolves.toBe("2026-07-23T00:00:00+07:00")
  })

  test("lenient mode keeps the authored calendar day of an offset-bearing date", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    // The instant falls on 05-20 in UTC+7, but the cell says the 19th and the
    // strict normalizer already understands it — so the authored day wins.
    // The CSV import path asserts the same value; the two must not diverge.
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "2026-05-19T23:30:00-04:00",
        resolveSourceTimezone: resolver,
        temporalInputParsing: "lenient",
      }),
    ).resolves.toBe("2026-05-19T00:00:00+07:00")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "2026-05-19T20:00:00Z",
        resolveSourceTimezone: resolver,
        temporalInputParsing: "lenient",
      }),
    ).resolves.toBe("2026-05-19T00:00:00+07:00")
  })

  test("lenient mode still re-anchors a date the strict normalizer rejects", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    // A unix timestamp names an instant with no authored day to preserve, so it
    // is projected into the source zone: 2023-11-14T22:13:20Z is already the
    // 15th in UTC+7.
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "1700000000",
        resolveSourceTimezone: resolver,
        temporalInputParsing: "lenient",
      }),
    ).resolves.toBe("2023-11-15T00:00:00+07:00")
  })

  test("lenient mode parses a unix timestamp into a datetime UTC instant", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "1721800800",
        resolveSourceTimezone: resolver,
        temporalInputParsing: "lenient",
      }),
    ).resolves.toBe("2024-07-24T06:00:00.000Z")
  })

  test("lenient mode remains a strict superset for canonical fractional datetimes", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "2026-07-23T09:30:00.123",
        resolveSourceTimezone: resolver,
        temporalInputParsing: "lenient",
      }),
    ).resolves.toBe("2026-07-23T02:30:00.123Z")
  })

  test("strict mode by default still rejects a non-ISO value", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "23/07/2026 09:30",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBeNull()
  })

  test("lenient mode returns null for genuinely unparseable input", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "not-a-date-at-all",
        resolveSourceTimezone: resolver,
        temporalInputParsing: "lenient",
      }),
    ).resolves.toBeNull()
  })

  test("lenient mode gives a time-only cell today's date in the source zone", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"
    // Server clock still says 2026-07-22, the workspace is already on 07-23.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-22T18:00:00Z"))

    try {
      await expect(
        normalizeCustomFieldValueForStorage({
          type: "datetime",
          value: "09:30",
          resolveSourceTimezone: resolver,
          temporalInputParsing: "lenient",
        }),
      ).resolves.toBe("2026-07-23T02:30:00.000Z")

      await expect(
        normalizeCustomFieldValueForStorage({
          type: "date",
          value: "09:30",
          resolveSourceTimezone: resolver,
          temporalInputParsing: "lenient",
        }),
      ).resolves.toBe("2026-07-23T00:00:00+07:00")
    } finally {
      vi.useRealTimers()
    }
  })

  test("workspace strategy resolves the workspace zone without a contact query", async () => {
    const contactFindFirst = vi.fn()
    const workspaceFindFirst = vi
      .fn()
      .mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
    const tx = {
      query: {
        contactModel: { findFirst: contactFindFirst },
        workspaceModel: { findFirst: workspaceFindFirst },
      },
    } as unknown as DatabaseClient

    const resolver = createSourceTimezoneResolver({
      workspaceId: "1",
      contactId: "2",
      strategy: "workspace",
      tx,
    })

    await expect(resolver()).resolves.toBe("Asia/Ho_Chi_Minh")
    expect(contactFindFirst).not.toHaveBeenCalled()
    expect(workspaceFindFirst).toHaveBeenCalledTimes(1)
  })
})

describe("explicit source-timezone override", () => {
  test("anchors every temporal type without a DB lookup", async () => {
    const contactFindFirst = vi.fn()
    const workspaceFindFirst = vi.fn()
    const tx = {
      query: {
        contactModel: { findFirst: contactFindFirst },
        workspaceModel: { findFirst: workspaceFindFirst },
      },
    } as unknown as DatabaseClient

    // A flow "set custom field" step passes its captured editor browser zone
    // here so both date and naive datetime anchor to the author's zone.
    const resolver = createSourceTimezoneResolver({
      workspaceId: "1",
      contactId: "2",
      explicitSourceTimezone: "America/New_York",
      tx,
    })

    await expect(resolver()).resolves.toBe("America/New_York")
    await expect(resolver()).resolves.toBe("America/New_York")
    // The override short-circuits the resolver: no contact/workspace query.
    expect(contactFindFirst).not.toHaveBeenCalled()
    expect(workspaceFindFirst).not.toHaveBeenCalled()
  })

  test("falls back to the contact/workspace resolver when the override is blank", async () => {
    const contactFindFirst = vi.fn().mockResolvedValue({ timezone: null })
    const workspaceFindFirst = vi
      .fn()
      .mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
    const tx = {
      query: {
        contactModel: { findFirst: contactFindFirst },
        workspaceModel: { findFirst: workspaceFindFirst },
      },
    } as unknown as DatabaseClient

    const resolver = createSourceTimezoneResolver({
      workspaceId: "1",
      contactId: "2",
      // Existing flow steps saved before this feature carry no timezone; a blank
      // override must not suppress the contact/workspace fallback (no regression).
      explicitSourceTimezone: "   ",
      tx,
    })

    await expect(resolver()).resolves.toBe("Asia/Ho_Chi_Minh")
    expect(workspaceFindFirst).toHaveBeenCalledTimes(1)
  })

  test("a naive datetime anchors to the override zone, ignoring the client zone", async () => {
    // End-to-end: the service builds the resolver from the step's captured zone,
    // so a naive datetime (which always consults the resolver) lands in UTC+7
    // even though the submitter's browser zone (explicitTimezone) is UTC-4.
    const resolveSourceTimezone = createSourceTimezoneResolver({
      workspaceId: "1",
      contactId: "2",
      explicitSourceTimezone: "Asia/Ho_Chi_Minh",
      tx: {
        query: {
          contactModel: { findFirst: vi.fn() },
          workspaceModel: { findFirst: vi.fn() },
        },
      } as unknown as DatabaseClient,
    })

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "datetime",
        value: "2026-07-22 15:30",
        resolveSourceTimezone,
        explicitTimezone: "America/New_York",
      }),
    ).resolves.toBe("2026-07-22T08:30:00.000Z")
  })
})

describe("blank temporal value stamps now", () => {
  test("date stamps today's start of day in the resolved zone", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"
    vi.useFakeTimers()
    // 18:00Z is already 01:00 on 07-23 in UTC+7.
    vi.setSystemTime(new Date("2026-07-22T18:00:00Z"))

    try {
      await expect(
        normalizeCustomFieldValueForStorage({
          type: "date",
          value: "",
          resolveSourceTimezone: resolver,
          fillEmptyTemporalWithNow: true,
        }),
      ).resolves.toBe("2026-07-23T00:00:00+07:00")
    } finally {
      vi.useRealTimers()
    }
  })

  test("datetime stamps the current instant as UTC", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-22T18:00:00Z"))

    try {
      // now -> wall clock in UTC+7 -> back to the exact frozen UTC instant.
      await expect(
        normalizeCustomFieldValueForStorage({
          type: "datetime",
          value: "",
          resolveSourceTimezone: resolver,
          fillEmptyTemporalWithNow: true,
        }),
      ).resolves.toBe("2026-07-22T18:00:00.000Z")
    } finally {
      vi.useRealTimers()
    }
  })

  test("leaves a blank temporal value empty when the flag is off", async () => {
    const resolver = vi.fn(async () => "Asia/Ho_Chi_Minh")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("")
    // No source-zone lookup for a blank value the caller doesn't want filled.
    expect(resolver).not.toHaveBeenCalled()
  })

  test("passes a blank non-temporal value through even when the flag is on", async () => {
    const resolver = vi.fn(async () => "Asia/Ho_Chi_Minh")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "shortText",
        value: "",
        resolveSourceTimezone: resolver,
        fillEmptyTemporalWithNow: true,
      }),
    ).resolves.toBe("")
    expect(resolver).not.toHaveBeenCalled()
  })
})
