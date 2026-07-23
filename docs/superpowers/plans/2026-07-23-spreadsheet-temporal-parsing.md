# Spreadsheet Multi-Format Date/Datetime Parsing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Google Sheets "get row" / "get random row" flow steps store `date`/`datetime` custom fields from *any* common real-world format (DMY/MDY/named-month/ISO/unix timestamp), anchoring naive values to the workspace timezone.

**Architecture:** A new pure parser in `@chatbotx.io/utils` (`temporal-input.ts`) turns a raw cell into a canonical string the *existing, untouched* normalizer already accepts. Two typed enums thread a `Lenient` parsing mode and a `Workspace` timezone strategy from the worker handler → `contactCustomFieldService.setValues` → `normalizeCustomFieldValueForStorage`. The handler stays thin (one call, no parsing). All other write paths (UI forms, CSV import) keep today's `Strict` ISO-only behavior by default.

**Tech Stack:** TypeScript 5, date-fns v4.4.0 (`parse` with `strictValidation`), date-fns-tz v3.2.0 (`fromZonedTime`, `formatInTimeZone`), Vitest 4, Drizzle relational queries, pnpm workspaces.

**Design spec:** `docs/superpowers/specs/2026-07-23-spreadsheet-temporal-parsing-design.md`

## Global Constraints

- **No `any`.** Use `unknown` + narrowing or generics. (`.claude/rules/typescript/coding-style.md`)
- **No raw SQL.** All DB access via Drizzle relational/model queries; parameterized only — no string concatenation. (invariant #9, security rule)
- **No direct `db` in app layer.** The worker handler must go through `contactCustomFieldService`; never import `db` for this write. (invariant #9)
- **No dynamic `import()`** — breaks the tsdown build. (`.agents/rules/no-dynamic-import.md`)
- **Strategy/handler-map pattern, no if-else ladders** — mirror `temporalCustomFieldNormalizationHandlers` (`... as const satisfies Record<...>`) and ordered `readonly` arrays. (project idiom)
- **Enums as `const` objects** (`{ ... } as const` + derived `type`), never TS `enum`. (`.claude/rules/typescript/coding-style.md`: "Prefer string literal unions over `enum`.")
- **Backward compatible.** Every new option is optional with a default that preserves current behavior. Existing callers of `setValues` / `normalizeCustomFieldValueForStorage` must be untouched and stay green.
- **Do not change** `getSheetValues` / the Google Sheets integration render option, and do not change the CSV import path (`apps/worker/src/default/handlers/imports/validations/custom-field-value.ts`).
- **No sensitive data in logs.** The skip-warning logs field id + type only, never the raw cell value.
- **Quality gate before done:** `pnpm lint` clean, plus `check-types` green for every touched workspace. Use `pnpm fix` for formatting, never hand-format.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `packages/utils/src/temporal-input.ts` | Pure: raw cell → canonical temporal string, or `null`. Strategy-pattern matcher list. | **Create** |
| `packages/utils/package.json` | Expose `./temporal-input` subpath export. | Modify |
| `packages/utils/__tests__/temporal-input.test.ts` | Full format matrix for the parser. | **Create** |
| `packages/utils/src/datetime.ts` | Home of `TemporalInputParsing` + `SourceTimezoneStrategy` enums (co-located with the temporal types they govern). | Modify (append) |
| `packages/utils/__tests__/datetime.test.ts` | Enum-shape assertions. | Modify (append) |
| `packages/business/src/contact-custom-field/normalize.ts` | Thread `temporalInputParsing` (front-end parse) + `strategy` (workspace-only resolver). | Modify |
| `packages/business/src/contact-custom-field/service.ts` | Add options to `SetValuesInput`; forward them; scoped skip-warn. | Modify |
| `packages/business/__tests__/contact-custom-field-normalize.test.ts` | Lenient parse + workspace strategy tests. | Modify (append) |
| `packages/business/__tests__/contact-custom-field-set-values.test.ts` | End-to-end lenient `setValues` + strict regression + warn. | Modify (append) |
| `apps/worker/src/integration/handlers/spreadsheet-handler.ts` | Pass `Lenient` + `Workspace` in `updateContactCustomFields`. | Modify |
| `apps/worker/__tests__/spreadsheet-handler-temporal.test.ts` | Assert the handler wires the two flags. | **Create** |

---

## Task 1: Pure loose temporal parser (`@chatbotx.io/utils`)

**Files:**
- Create: `packages/utils/src/temporal-input.ts`
- Modify: `packages/utils/package.json:19-26` (exports map)
- Test: `packages/utils/__tests__/temporal-input.test.ts`

**Interfaces:**
- Consumes: from `./datetime` — `hasExplicitOffset(value: string): boolean`, `resolveFilterTimezone(tz): string`, type `TemporalCustomFieldType` (`"date" | "datetime"`).
- Produces: `parseLooseTemporalValue(type: TemporalCustomFieldType, raw: string, anchorTimezone: string): string | null` — a canonical string (`yyyy-MM-dd` for `date`; `yyyy-MM-dd'T'HH:mm:ss` naive or `…Z` absolute for `datetime`) or `null`. Exported from `@chatbotx.io/utils/temporal-input`.

- [ ] **Step 1: Write the failing test**

Create `packages/utils/__tests__/temporal-input.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import { parseLooseTemporalValue } from "../src/temporal-input"

const VN = "Asia/Ho_Chi_Minh" // +07, no DST

describe("parseLooseTemporalValue — naive values (wall-clock, no zone)", () => {
  test.each([
    // [type, raw, expected canonical string]
    ["datetime", "23/07/2026", "2026-07-23T00:00:00"],
    ["datetime", "23/07/2026 09:30", "2026-07-23T09:30:00"],
    ["datetime", "23/07/2026 09:30:45", "2026-07-23T09:30:45"],
    ["datetime", "2026-07-23", "2026-07-23T00:00:00"],
    ["datetime", "2026-07-23T09:30:00", "2026-07-23T09:30:00"],
    ["datetime", "2026-07-23 09:30", "2026-07-23T09:30:00"],
    ["datetime", "Jul 23, 2026", "2026-07-23T00:00:00"],
    ["datetime", "23 July 2026", "2026-07-23T00:00:00"],
    ["datetime", "23-07-2026", "2026-07-23T00:00:00"],
    ["datetime", "23.07.2026", "2026-07-23T00:00:00"],
    ["date", "23/07/2026", "2026-07-23"],
    ["date", "23/07/2026 09:30", "2026-07-23"],
    ["date", "2026-07-23", "2026-07-23"],
    ["date", "Jul 23, 2026", "2026-07-23"],
  ] as const)("parses %s %j -> %j", (type, raw, expected) => {
    expect(parseLooseTemporalValue(type, raw, VN)).toBe(expected)
  })

  test("unpadded day/month components parse", () => {
    expect(parseLooseTemporalValue("date", "3/7/2026", VN)).toBe("2026-07-03")
  })

  test("day-first wins for ambiguous values", () => {
    // 12/07 must read as 12 July (DMY), never 7 December (MDY).
    expect(parseLooseTemporalValue("date", "12/07/2026", VN)).toBe("2026-07-12")
  })

  test("structurally-impossible DMY falls through to the MDY rescue", () => {
    // 07/13 cannot be day 07 / month 13, so it reads as month 07 / day 13.
    expect(parseLooseTemporalValue("date", "07/13/2026", VN)).toBe("2026-07-13")
  })
})

describe("parseLooseTemporalValue — absolute instants (unix / explicit offset)", () => {
  test.each([
    ["1721800800", "2024-07-24T06:00:00.000Z"], // seconds
    ["1721800800000", "2024-07-24T06:00:00.000Z"], // milliseconds (>= 1e12)
    ["1700000000", "2023-11-14T22:13:20.000Z"], // seconds
    ["1700000000000", "2023-11-14T22:13:20.000Z"], // milliseconds
  ] as const)("datetime unix %j -> UTC %j", (raw, expected) => {
    expect(parseLooseTemporalValue("datetime", raw, VN)).toBe(expected)
  })

  test("datetime with explicit offset -> UTC instant", () => {
    expect(
      parseLooseTemporalValue("datetime", "2026-07-22T15:30:00+07:00", VN),
    ).toBe("2026-07-22T08:30:00.000Z")
  })

  test("datetime with Z -> unchanged UTC instant", () => {
    expect(
      parseLooseTemporalValue("datetime", "2026-07-22T08:30:00.000Z", VN),
    ).toBe("2026-07-22T08:30:00.000Z")
  })

  test("date from a unix instant resolves the calendar day in the anchor zone", () => {
    // 22:13:20Z + 07:00 crosses into the next calendar day.
    expect(parseLooseTemporalValue("date", "1700000000", VN)).toBe("2023-11-15")
    // Daytime instant stays on the same day.
    expect(parseLooseTemporalValue("date", "1721800800", VN)).toBe("2024-07-24")
  })
})

describe("parseLooseTemporalValue — unrecognized input", () => {
  test.each([
    ["datetime", ""],
    ["datetime", "   "],
    ["datetime", "not-a-date"],
    ["date", "hello world"],
    ["date", "2026-02-30"], // impossible day -> rejected
    ["date", "32/01/2026"], // impossible day -> rejected
    ["datetime", "2026-13-01"], // impossible month -> rejected
  ] as const)("returns null for %s %j", (type, raw) => {
    expect(parseLooseTemporalValue(type, raw, VN)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @chatbotx.io/utils test temporal-input`
Expected: FAIL — `Failed to resolve import "../src/temporal-input"` / module not found.

- [ ] **Step 3: Create the parser module**

Create `packages/utils/src/temporal-input.ts`:

```ts
import { format, isValid, parse } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import {
  hasExplicitOffset,
  resolveFilterTimezone,
  type TemporalCustomFieldType,
} from "./datetime"

// A value >= 1e12 ms since epoch is year 2001+; only milliseconds are ever that
// large, so a magnitude at or above this is ms and anything smaller is seconds.
const UNIX_MS_THRESHOLD = 1e12
const UNIX_TIMESTAMP_PATTERN = /^[+-]?\d+$/
// Fixed local-midnight anchor. date-fns `parse` fills unspecified fields from
// this reference: date-only patterns inherit 00:00:00, while any y/M/d in the
// input overwrites the 2000-01-01 date parts. Fixed (not `new Date()`) so a
// date-only value never picks up the current time-of-day.
const REFERENCE_DATE = new Date(2000, 0, 1)

// Output shape per field type. `date` emits a bare calendar day; `datetime`
// emits a naive local ISO the downstream normalizer anchors to the zone.
const NAIVE_OUTPUT_FORMATS = {
  date: "yyyy-MM-dd",
  datetime: "yyyy-MM-dd'T'HH:mm:ss",
} as const satisfies Record<TemporalCustomFieldType, string>

// Ordered "first exact match wins" list. date-fns `parse` returns Invalid Date
// on any trailing input and (with strictValidation) on impossible dates, so a
// wrong pattern fails cleanly and the next is tried — no pattern can mis-match.
// Day-first precedes month-first so ambiguous d/M/y reads as DMY; a
// structurally-impossible DMY (month > 12) falls through to the MDY rescue.
// Single-token d/M/H/h accept both padded and unpadded input, so no separate
// zero-padded variants are needed (DRY).
const CANONICAL_INPUT_FORMATS: readonly string[] = [
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "yyyy-MM-dd",
  "d/M/yyyy H:mm:ss",
  "d/M/yyyy H:mm",
  "d/M/yyyy",
  "d-M-yyyy H:mm",
  "d-M-yyyy",
  "d.M.yyyy H:mm",
  "d.M.yyyy",
  "M/d/yyyy h:mm a",
  "M/d/yyyy H:mm",
  "M/d/yyyy",
  "d MMM yyyy H:mm",
  "d MMM yyyy",
  "d MMMM yyyy",
  "MMM d, yyyy h:mm a",
  "MMM d, yyyy",
  "MMMM d, yyyy",
]

type TemporalParseResult =
  | { readonly kind: "naive"; readonly date: Date }
  | { readonly kind: "absolute"; readonly instant: Date }

type TemporalMatcher = {
  readonly name: string
  readonly match: (raw: string) => TemporalParseResult | null
}

// Explicit offset / Z -> a fixed point in time. `new Date(raw)` honors the
// offset, so the workspace zone is irrelevant to this value.
const offsetMatcher: TemporalMatcher = {
  name: "offset",
  match: (raw) => {
    if (!hasExplicitOffset(raw)) {
      return null
    }
    const instant = new Date(raw)
    return isValid(instant) ? { kind: "absolute", instant } : null
  },
}

// A bare integer is a unix timestamp — also an absolute instant.
const unixTimestampMatcher: TemporalMatcher = {
  name: "unix",
  match: (raw) => {
    if (!UNIX_TIMESTAMP_PATTERN.test(raw)) {
      return null
    }
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) {
      return null
    }
    const milliseconds =
      Math.abs(numeric) >= UNIX_MS_THRESHOLD ? numeric : numeric * 1000
    const instant = new Date(milliseconds)
    return isValid(instant) ? { kind: "absolute", instant } : null
  },
}

// Locale/display formats -> a naive wall-clock the caller anchors to a zone.
const formatMatcher: TemporalMatcher = {
  name: "format",
  match: (raw) => {
    for (const pattern of CANONICAL_INPUT_FORMATS) {
      const parsed = parse(raw, pattern, REFERENCE_DATE, {
        strictValidation: true,
      })
      if (isValid(parsed)) {
        return { kind: "naive", date: parsed }
      }
    }
    return null
  },
}

const TEMPORAL_MATCHERS: readonly TemporalMatcher[] = [
  offsetMatcher,
  unixTimestampMatcher,
  formatMatcher,
]

const projectResult = (
  type: TemporalCustomFieldType,
  result: TemporalParseResult,
  anchorTimezone: string,
): string => {
  if (result.kind === "absolute") {
    // datetime keeps the exact instant (UTC); date reduces it to the calendar
    // day as seen in the anchor (workspace) zone.
    return type === "date"
      ? formatInTimeZone(
          result.instant,
          anchorTimezone,
          NAIVE_OUTPUT_FORMATS.date,
        )
      : result.instant.toISOString()
  }
  return format(result.date, NAIVE_OUTPUT_FORMATS[type])
}

/**
 * Best-effort parse of a raw spreadsheet cell into a canonical string that
 * `normalizeTemporalCustomFieldValue` accepts. Returns null when no matcher
 * recognizes the input (caller skips storage rather than persist garbage).
 *
 * - Naive values (no zone) -> wall-clock string; the normalizer later anchors
 *   them to the workspace zone.
 * - Absolute instants (unix / explicit offset) -> UTC ISO for `datetime`, or the
 *   `anchorTimezone`-local calendar day for `date`.
 */
export const parseLooseTemporalValue = (
  type: TemporalCustomFieldType,
  raw: string,
  anchorTimezone: string,
): string | null => {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  const safeTimezone = resolveFilterTimezone(anchorTimezone)
  for (const matcher of TEMPORAL_MATCHERS) {
    const result = matcher.match(trimmed)
    if (result) {
      return projectResult(type, result, safeTimezone)
    }
  }
  return null
}
```

- [ ] **Step 4: Add the subpath export**

Modify `packages/utils/package.json` — add the `./temporal-input` entry to the `exports` map (keep alphabetical-ish order matching the file):

```json
  "exports": {
    ".": "./src/index.ts",
    "./ai": "./src/ai.ts",
    "./crypto": "./src/crypto.ts",
    "./datetime": "./src/datetime.ts",
    "./id": "./src/id.ts",
    "./temporal-input": "./src/temporal-input.ts",
    "./zod": "./src/zod.ts"
  },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @chatbotx.io/utils test temporal-input`
Expected: PASS — all cases green.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @chatbotx.io/utils check-types`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/utils/src/temporal-input.ts packages/utils/package.json packages/utils/__tests__/temporal-input.test.ts
git commit -m "feat(utils): add loose multi-format temporal value parser"
```

---

## Task 2: Parsing-mode + timezone-strategy enums and business-layer threading

**Files:**
- Modify: `packages/utils/src/datetime.ts` (append enums after line 6)
- Modify: `packages/utils/__tests__/datetime.test.ts` (append enum assertions)
- Modify: `packages/business/src/contact-custom-field/normalize.ts`
- Test: `packages/business/__tests__/contact-custom-field-normalize.test.ts` (append)

**Interfaces:**
- Consumes: `parseLooseTemporalValue` (Task 1); existing `normalizeTemporalCustomFieldValue`, `resolveFilterTimezone`, `isTemporalCustomFieldType`, `DEFAULT_FILTER_TIMEZONE`, `hasExplicitOffset` from `@chatbotx.io/utils/datetime`.
- Produces:
  - `TemporalInputParsing = { Strict: "strict", Lenient: "lenient" }` + type (in `datetime.ts`).
  - `SourceTimezoneStrategy = { ContactThenWorkspace: "contactThenWorkspace", Workspace: "workspace" }` + type (in `datetime.ts`).
  - `createSourceTimezoneResolver({ workspaceId, contactId, strategy?, tx? })` — `strategy` defaults to `ContactThenWorkspace`.
  - `normalizeCustomFieldValueForStorage({ type, value, resolveSourceTimezone, explicitTimezone?, temporalInputParsing? })` — `temporalInputParsing` defaults to `Strict`.

- [ ] **Step 1: Write the failing enum-shape test**

Append to `packages/utils/__tests__/datetime.test.ts` (add the two names to the existing top import from `../src/datetime`, then add this `describe` at the end of the file):

```ts
import {
  SourceTimezoneStrategy,
  TemporalInputParsing,
} from "../src/datetime"

describe("temporal write-path enums", () => {
  test("parsing-mode values are stable", () => {
    expect(TemporalInputParsing.Strict).toBe("strict")
    expect(TemporalInputParsing.Lenient).toBe("lenient")
  })

  test("source-timezone strategy values are stable", () => {
    expect(SourceTimezoneStrategy.ContactThenWorkspace).toBe(
      "contactThenWorkspace",
    )
    expect(SourceTimezoneStrategy.Workspace).toBe("workspace")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @chatbotx.io/utils test datetime`
Expected: FAIL — `SourceTimezoneStrategy`/`TemporalInputParsing` are not exported.

- [ ] **Step 3: Add the enums to `datetime.ts`**

In `packages/utils/src/datetime.ts`, immediately after line 6 (`export type TemporalCustomFieldType = ...`), insert:

```ts

/**
 * How a write path parses raw temporal input before normalization.
 * - Strict: accept only canonical ISO (today's behavior; UI forms, CSV import).
 * - Lenient: run the loose multi-format parser first (spreadsheet step).
 */
export const TemporalInputParsing = {
  Strict: "strict",
  Lenient: "lenient",
} as const
export type TemporalInputParsing =
  (typeof TemporalInputParsing)[keyof typeof TemporalInputParsing]

/**
 * Which zone anchors a naive temporal value at write time.
 * - ContactThenWorkspace: contact zone, falling back to workspace (default).
 * - Workspace: workspace zone only — skips the contact lookup (one fewer query).
 */
export const SourceTimezoneStrategy = {
  ContactThenWorkspace: "contactThenWorkspace",
  Workspace: "workspace",
} as const
export type SourceTimezoneStrategy =
  (typeof SourceTimezoneStrategy)[keyof typeof SourceTimezoneStrategy]
```

- [ ] **Step 4: Run to verify the enum test passes**

Run: `pnpm --filter @chatbotx.io/utils test datetime`
Expected: PASS.

- [ ] **Step 5: Write the failing business-layer test**

Append to `packages/business/__tests__/contact-custom-field-normalize.test.ts` (inside the existing top-level `describe`, or as a new sibling `describe` at end of file):

```ts
describe("lenient temporal parsing and workspace strategy", () => {
  test("lenient mode parses a DMY datetime and anchors it to the source zone", async () => {
    const resolver = async () => "Asia/Ho_Chi_Minh"

    // "23/07/2026 09:30" is workspace wall-clock (+7) -> UTC.
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

  test("strict mode (default) still rejects a non-ISO value", async () => {
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
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @chatbotx.io/business test contact-custom-field-normalize`
Expected: FAIL — `temporalInputParsing` / `strategy` not handled; lenient cases resolve to `null`, workspace strategy still queries the contact.

- [ ] **Step 7: Thread the options through `normalize.ts`**

In `packages/business/src/contact-custom-field/normalize.ts`:

7a. Update the imports from `@chatbotx.io/utils/datetime` (add `SourceTimezoneStrategy`, `TemporalInputParsing`) and add the parser import:

```ts
import {
  DEFAULT_FILTER_TIMEZONE,
  hasExplicitOffset,
  isTemporalCustomFieldType,
  normalizeTemporalCustomFieldValue,
  resolveFilterTimezone,
  SourceTimezoneStrategy,
  TemporalInputParsing,
  type TemporalCustomFieldType,
} from "@chatbotx.io/utils/datetime"
import { parseLooseTemporalValue } from "@chatbotx.io/utils/temporal-input"
```

7b. Replace `resolveSourceTimezone` (lines 30-51) with a strategy-aware version:

```ts
const resolveSourceTimezone = async (input: {
  workspaceId: string
  contactId: string
  strategy: SourceTimezoneStrategy
  tx?: DatabaseClient
}): Promise<string> => {
  const query = input.tx ?? db

  // Workspace strategy: the contact zone is irrelevant (e.g. sheet imports use
  // the workspace clock), so skip that lookup entirely — one fewer query per
  // write at chatbot scale.
  if (input.strategy === SourceTimezoneStrategy.Workspace) {
    const workspace = await query.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
      columns: { timezone: true },
    })
    return resolveFilterTimezone(normalizeStoredTimezone(workspace?.timezone))
  }

  const [contact, workspace] = await Promise.all([
    query.query.contactModel.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      columns: { timezone: true },
    }),
    query.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
      columns: { timezone: true },
    }),
  ])

  return resolveFilterTimezone(
    normalizeStoredTimezone(contact?.timezone) ??
      normalizeStoredTimezone(workspace?.timezone),
  )
}
```

7c. Replace `createSourceTimezoneResolver` (lines 53-64) to accept and default the strategy:

```ts
export const createSourceTimezoneResolver = (input: {
  workspaceId: string
  contactId: string
  strategy?: SourceTimezoneStrategy
  tx?: DatabaseClient
}): SourceTimezoneResolver => {
  let sourceTimezonePromise: Promise<string> | undefined
  const strategy = input.strategy ?? SourceTimezoneStrategy.ContactThenWorkspace

  return async () => {
    sourceTimezonePromise ??= resolveSourceTimezone({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      strategy,
      tx: input.tx,
    })
    return await sourceTimezonePromise
  }
}
```

7d. Replace `normalizeCustomFieldValueForStorage` (lines 97-124) to run the lenient front-end parse before the existing normalizer:

```ts
export const normalizeCustomFieldValueForStorage = async (input: {
  type: CustomFieldType
  value: string
  resolveSourceTimezone: SourceTimezoneResolver
  /**
   * Browser zone captured at form submit. Honored only by `date` (see
   * TEMPORAL_HONORS_EXPLICIT_TIMEZONE); `datetime` ignores it and keeps
   * resolving via the stored contact/workspace zones.
   */
  explicitTimezone?: string | null
  /**
   * Strict (default): accept only canonical ISO. Lenient: run the loose
   * multi-format parser first (spreadsheet step). Non-temporal types ignore it.
   */
  temporalInputParsing?: TemporalInputParsing
}): Promise<string | null> => {
  const {
    type,
    value,
    resolveSourceTimezone,
    explicitTimezone,
    temporalInputParsing = TemporalInputParsing.Strict,
  } = input

  if (value.length === 0 || !isTemporalCustomFieldType(type)) {
    return value
  }

  const sourceTimezone = await resolveTemporalSourceTimezone({
    type,
    value,
    explicitTimezone,
    resolveSourceTimezone,
  })

  // Lenient path: turn a raw sheet cell into a canonical string the strict
  // normalizer accepts. The source zone anchors absolute-instant -> date only;
  // naive values are reformatted wall-clock and anchored below as before.
  const canonicalValue =
    temporalInputParsing === TemporalInputParsing.Lenient
      ? parseLooseTemporalValue(type, value, sourceTimezone)
      : value

  // Return null (not the raw value) when the temporal value can't be
  // normalized: persisting an un-normalized string would corrupt a column the
  // rest of the system reads as UTC ISO. The caller skips it.
  if (canonicalValue === null) {
    return null
  }

  return normalizeTemporalCustomFieldValue(type, canonicalValue, sourceTimezone)
}
```

- [ ] **Step 8: Run to verify the business test passes**

Run: `pnpm --filter @chatbotx.io/business test contact-custom-field-normalize`
Expected: PASS — new cases green AND all pre-existing cases in this file still pass (strict default unchanged).

- [ ] **Step 9: Typecheck both packages**

Run: `pnpm --filter @chatbotx.io/utils check-types && pnpm --filter @chatbotx.io/business check-types`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/utils/src/datetime.ts packages/utils/__tests__/datetime.test.ts packages/business/src/contact-custom-field/normalize.ts packages/business/__tests__/contact-custom-field-normalize.test.ts
git commit -m "feat(contacts): thread lenient parsing and workspace-tz strategy through custom-field normalization"
```

---

## Task 3: `setValues` options + scoped skip-warning

**Files:**
- Modify: `packages/business/src/contact-custom-field/service.ts`
- Test: `packages/business/__tests__/contact-custom-field-set-values.test.ts` (append)

**Interfaces:**
- Consumes: `TemporalInputParsing`, `SourceTimezoneStrategy` from `@chatbotx.io/utils/datetime`; `createSourceTimezoneResolver` (now strategy-aware, Task 2); `logger` from `../logger`.
- Produces: `SetValuesInput` gains optional `temporalInputParsing?: TemporalInputParsing` and `sourceTimezoneStrategy?: SourceTimezoneStrategy`. `setValues` return type stays `Promise<void>`.

- [ ] **Step 1: Write the failing test**

First, extend the hoisted mocks and add a logger mock at the top of `packages/business/__tests__/contact-custom-field-set-values.test.ts`.

1a. Add `loggerWarn` to the `vi.hoisted` mocks object (after `invalidateCacheByTags`):

```ts
  invalidateCacheByTags: vi.fn(async () => undefined),
  loggerWarn: vi.fn(),
}))
```

1b. Add a logger module mock next to the other `vi.mock(...)` blocks:

```ts
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    warn: mocks.loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))
```

1c. Append a new `describe` block at the end of the file:

```ts
describe("contactCustomFieldService.setValues — lenient spreadsheet parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.contactCustomFieldFindMany.mockResolvedValue([])
    mocks.workspaceFindFirst.mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
  })

  test("parses a DMY datetime cell and stores it as the workspace-anchored UTC instant", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-dt", name: "booking_at", type: "datetime" },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "23/07/2026 09:30" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: "cf-dt",
        value: "2026-07-23T02:30:00.000Z",
      }),
    )
    // Workspace strategy must not query the contact row.
    expect(mocks.contactFindFirst).not.toHaveBeenCalled()
  })

  test("parses a unix timestamp cell into a datetime UTC instant", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-dt", name: "booking_at", type: "datetime" },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "1721800800" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "2024-07-24T06:00:00.000Z" }),
    )
  })

  test("warns and skips an unparseable cell under lenient parsing", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-dt", name: "booking_at", type: "datetime" },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "definitely not a date" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    // The warning must not leak the raw cell value.
    const [logContext] = mocks.loggerWarn.mock.calls[0]
    expect(logContext).toMatchObject({
      workspaceId: "ws-1",
      contactId: "contact-1",
      customFieldId: "cf-dt",
      type: "datetime",
    })
    expect(JSON.stringify(logContext)).not.toContain("definitely not a date")
  })

  test("strict default does NOT warn when skipping an un-normalizable value", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-d", name: "birthday", type: "date" },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-d", value: "2026-02-30" }],
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @chatbotx.io/business test contact-custom-field-set-values`
Expected: FAIL — `temporalInputParsing`/`sourceTimezoneStrategy` not accepted; lenient cells resolve to `null` and no warn fires.

- [ ] **Step 3: Thread the options + add the scoped warn in `service.ts`**

In `packages/business/src/contact-custom-field/service.ts`:

3a. Add TWO new import statements. The `createId, isNumericId` line (line 10) already exists and is shown only as an anchor — do not duplicate it. Insert the datetime-enum and logger imports right after it:

```ts
import { createId, isNumericId } from "@chatbotx.io/utils" // existing — anchor only
import {
  type SourceTimezoneStrategy,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { logger } from "../logger"
```

3b. Extend `SetValuesInput` (lines 19-25):

```ts
type SetValuesInput = {
  workspaceId: string
  contactId: string
  fields: Array<{ customFieldId: string; value: string }>
  /** Browser zone captured at form submit; anchors naive `date` values. */
  sourceTimezone?: string
  /**
   * Strict (default): accept only canonical ISO temporal input. Lenient: run
   * the multi-format parser first (spreadsheet step).
   */
  temporalInputParsing?: TemporalInputParsing
  /**
   * Which zone anchors naive temporal values. Defaults to contact→workspace;
   * the spreadsheet step uses `workspace` to skip the contact lookup.
   */
  sourceTimezoneStrategy?: SourceTimezoneStrategy
}
```

3c. In `setValues`, destructure the new fields (line 105):

```ts
    const {
      workspaceId,
      contactId,
      fields,
      sourceTimezone,
      temporalInputParsing,
      sourceTimezoneStrategy,
    } = input
```

3d. Pass the strategy into the resolver (lines 128-132):

```ts
      const resolveSourceTimezone = createSourceTimezoneResolver({
        workspaceId,
        contactId,
        strategy: sourceTimezoneStrategy,
        tx: client,
      })
```

3e. Pass the parsing mode into the normalizer and warn on a lenient skip (lines 141-150):

```ts
          const normalizedValue = await normalizeCustomFieldValueForStorage({
            type: customField.type,
            value: field.value,
            resolveSourceTimezone,
            explicitTimezone: sourceTimezone,
            temporalInputParsing,
          })
          // Un-normalizable temporal value: skip rather than persist garbage.
          // Under lenient (spreadsheet) parsing we tried every known format, so
          // a null here is a genuinely undecodable cell worth surfacing — log
          // the field identity only, never the raw value (may be PII).
          if (normalizedValue === null) {
            if (temporalInputParsing === TemporalInputParsing.Lenient) {
              logger.warn(
                {
                  workspaceId,
                  contactId,
                  customFieldId: customField.id,
                  type: customField.type,
                },
                "Skipped unparseable temporal custom-field value from a lenient source",
              )
            }
            return null
          }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @chatbotx.io/business test contact-custom-field-set-values`
Expected: PASS — new cases green AND all pre-existing set-values cases still pass (strict default: no warn, contact-then-workspace resolution intact).

- [ ] **Step 5: Run the full contact-custom-field suite (regression)**

Run: `pnpm --filter @chatbotx.io/business test contact-custom-field`
Expected: PASS — normalize, set-values, and delete suites all green.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @chatbotx.io/business check-types`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/business/src/contact-custom-field/service.ts packages/business/__tests__/contact-custom-field-set-values.test.ts
git commit -m "feat(contacts): accept lenient parsing and workspace-tz strategy in setValues"
```

---

## Task 4: Wire the spreadsheet flow step

**Files:**
- Modify: `apps/worker/src/integration/handlers/spreadsheet-handler.ts:365-399`
- Test: `apps/worker/__tests__/spreadsheet-handler-temporal.test.ts`

**Interfaces:**
- Consumes: `contactCustomFieldService.setValues` (now accepts `temporalInputParsing` + `sourceTimezoneStrategy`, Task 3); `TemporalInputParsing`, `SourceTimezoneStrategy` from `@chatbotx.io/utils/datetime`.
- Produces: no new exports; `updateContactCustomFields` now calls `setValues` with `Lenient` + `Workspace`.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/__tests__/spreadsheet-handler-temporal.test.ts`. The handler's data path is `getSheetData` (auth via `integrationGoogleSheetService.findByWorkspaceIdOrFail` → worksheet via `findOrFail` → `buildContext` → `integrationGooglesheets.runAction("listSheetHeaders")` then `runAction("getSheetValues")`) → `findRows` (uses `isMatchedRow`) → `updateContactCustomFields`. Mock every one of those boundaries so the test is deterministic and asserts only the wiring — that `setValues` receives the two flags with the mapped fields. `isMatchedRow` is stubbed to `true` so the row-matching semantics (irrelevant here) never gate the test:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: {} })),
  buildContext: vi.fn(async () => ({})),
  runAction: vi.fn(),
  findOrFail: vi.fn(async () => ({ spreadsheetId: "sheet-abc" })),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: { setValues: mocks.setValues },
  integrationGoogleSheetService: {
    findByWorkspaceIdOrFail: mocks.findByWorkspaceIdOrFail,
  },
  buildContext: mocks.buildContext,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { contactCustomFieldModel: { findFirst: vi.fn() } } },
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({ spreadsheetModel: {} }))

vi.mock("@chatbotx.io/integration-google-sheets", () => ({
  integration: { runAction: mocks.runAction },
}))

// Real handler imports `isMatchedRow` from "./operator-handler"; stub it true so
// the matcher's empty-condition semantics never gate this wiring assertion.
vi.mock("../src/integration/handlers/operator-handler", () => ({
  isMatchedRow: () => true,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { getSpreadsheetRow } = await import(
  "../src/integration/handlers/spreadsheet-handler"
)

const CONVERSATION = {
  workspaceId: "ws-1",
  contactId: "contact-1",
} as unknown as Parameters<typeof getSpreadsheetRow>[0]["conversation"]

describe("spreadsheet handler — temporal custom-field write", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWorkspaceIdOrFail.mockResolvedValue({ auth: {} })
    mocks.findOrFail.mockResolvedValue({ spreadsheetId: "sheet-abc" })
    // getSheetData calls runAction twice: listSheetHeaders, then getSheetValues.
    mocks.runAction
      .mockResolvedValueOnce(["Name", "Birthday"])
      .mockResolvedValueOnce([["Alice", "23/07/2026"]])
  })

  test("forwards lenient parsing + workspace strategy with the mapped fields", async () => {
    const result = await getSpreadsheetRow({
      conversation: CONVERSATION,
      step: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "Sheet1",
        lookup: { mode: "all", conditions: [] },
        map: [{ header: "Birthday", customFieldId: "cf-d" }],
      },
    } as unknown as Parameters<typeof getSpreadsheetRow>[0])

    expect(result.status).toBe("success")
    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-d", value: "23/07/2026" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter worker test spreadsheet-handler-temporal`
Expected: FAIL — `setValues` called without `temporalInputParsing`/`sourceTimezoneStrategy` (received object omits them).

- [ ] **Step 3: Wire the flags in the handler**

In `apps/worker/src/integration/handlers/spreadsheet-handler.ts`:

3a. Add the enum import to the top import block (after the `@chatbotx.io/integration-google-sheets` import, before the local `logger` import):

```ts
import {
  SourceTimezoneStrategy,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
```

3b. Update the `setValues` call inside `updateContactCustomFields` (lines 394-398):

```ts
  await contactCustomFieldService.setValues({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    fields,
    // Sheet cells arrive as locale display strings / unix numbers, not ISO;
    // parse leniently. There is no per-contact submitter here, so anchor naive
    // values to the workspace clock (and skip the contact-zone lookup).
    temporalInputParsing: TemporalInputParsing.Lenient,
    sourceTimezoneStrategy: SourceTimezoneStrategy.Workspace,
  })
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter worker test spreadsheet-handler-temporal`
Expected: PASS.

- [ ] **Step 5: Typecheck the worker**

Run: `pnpm --filter worker check-types`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/integration/handlers/spreadsheet-handler.ts apps/worker/__tests__/spreadsheet-handler-temporal.test.ts
git commit -m "feat(spreadsheet): parse sheet dates in every format and anchor to the workspace timezone"
```

---

## Task 5: Full verification + invariant check

**Files:** none (verification only).

- [ ] **Step 1: Run every touched suite together**

Run:
```bash
pnpm --filter @chatbotx.io/utils test && \
pnpm --filter @chatbotx.io/business test contact-custom-field && \
pnpm --filter worker test spreadsheet-handler-temporal
```
Expected: all PASS.

- [ ] **Step 2: Typecheck all touched workspaces**

Run: `pnpm --filter @chatbotx.io/utils check-types && pnpm --filter @chatbotx.io/business check-types && pnpm --filter worker check-types`
Expected: no errors.

- [ ] **Step 3: Lint (CI gate)**

Run: `pnpm lint`
Expected: clean. If Biome flags formatting, run `pnpm fix` and re-commit.

- [ ] **Step 4: Invariant guard**

Dispatch the `invariant-guard` subagent on the diff (checks no-direct-`db`-in-app-layer, no dynamic import, i18n — none of which this change should trip). Confirm no violations.

- [ ] **Step 5: Commit any lint/format fixups**

```bash
git add -u packages/utils packages/business apps/worker
git commit -m "chore: lint/format fixups for spreadsheet temporal parsing"
```

(Skip this commit if steps 1-4 produced no changes.)

---

## Self-Review (author checklist — completed)

**1. Spec coverage:**
- §2 timezone semantics (naive → workspace wall-clock → UTC for datetime; offset-preserved for date) → Task 2 tests assert `2026-07-23T02:30:00.000Z` and `2026-07-23T00:00:00+07:00`. ✅
- §2 absolute instants (unix / offset) → Task 1 + Task 2 unix and offset tests. ✅
- §2.non-goal: CSV import untouched → not in any task's file list; strict default preserves it. ✅
- §2.non-goal: `getSheetValues` untouched → not in any task. ✅
- §3 strategy-pattern parser → Task 1 `TEMPORAL_MATCHERS` ordered array + `NAIVE_OUTPUT_FORMATS` map. ✅
- §4.2 enums → Task 2 Step 3. §4.2 workspace strategy skips contact query → Task 2 Step 5 + Task 3 assertion. ✅
- §4.3 thin handler + warn → Task 3 (warn) + Task 4 (handler). ✅
- §6 edge-case matrix → Task 1 test matrix (DMY/MDY/named-month/unix s+ms/offset/impossible dates/empty). ✅
- §9 flagged assumptions (time=`date`, unix→date in workspace tz, MDY rescue, warn) → all encoded; surfaced in the review gate below. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows real assertions. ✅

**3. Type consistency:** `parseLooseTemporalValue(type, raw, anchorTimezone)` signature identical across Task 1 (def), Task 2 (call in `normalize.ts`). `TemporalInputParsing`/`SourceTimezoneStrategy` string values (`"strict"`/`"lenient"`/`"workspace"`/`"contactThenWorkspace"`) identical across enum def (Task 2), tests, and call sites (Task 3/4). `createSourceTimezoneResolver` `strategy?` optional in def and call. `setValues` return stays `Promise<void>`. ✅

---

## Open items to confirm at execution (flagged defaults — plan proceeds unless vetoed)

1. **"thuộc tính time" = the `date` custom-field type** (the schema has only `date` + `datetime`).
2. **unix / offset instant written to a `date` field** → calendar day resolved in the **workspace** zone (Task 1 `projectResult`, `absolute` + `date`).
3. **MDY rescue** kept for structurally-impossible DMY (Task 1 format order).
4. **`logger.warn` on an unparseable lenient cell**, field-id/type only (no raw value); the flow step still returns `success`.

---

## Execution Handoff

Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints for review.
