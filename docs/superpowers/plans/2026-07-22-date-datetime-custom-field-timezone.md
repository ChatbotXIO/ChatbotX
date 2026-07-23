# Date/Datetime Custom Field Timezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store `date`/`datetime` custom-field values as absolute UTC ISO-8601 instants, convert correctly on every write/read/filter/display path, and backfill legacy naive values.

**Architecture:** A single pure conversion engine (`@chatbotx.io/utils/datetime`) is the one source of truth for "naive wall-clock + timezone → UTC ISO". Every write funnels through `contactCustomFieldService.setValues`, which normalizes by field *type* using a lazily-resolved source timezone (Contact → Workspace). Filter queries thread the browser timezone already captured in Phase 1 into the custom-field SQL predicate. Variable rendering formats in the workspace timezone; UI pickers emit/consume UTC ISO and display browser-local. A one-off SQL migration reinterprets existing naive values in the workspace timezone.

**Tech Stack:** TypeScript 5, Drizzle ORM + PostgreSQL, `date-fns` / `date-fns-tz` v4/v3, Vitest 4.1 (`globals: false`), pnpm workspaces + Turborepo.

## Global Constraints

- **Branch:** work on `feat/custom-field-timezone` (already created off the Phase 1 contact-filter-timezone work). Do NOT branch off `main`.
- **Storage format — datetime:** absolute UTC ISO-8601 with `Z`, e.g. `2026-07-22T08:30:00.000Z` (from `+07:00` wall-clock `2026-07-22 15:30`).
- **Storage format — date:** UTC instant of the *start of the calendar day* in the source zone, e.g. `2026-07-22` in `+07:00` → `2026-07-21T17:00:00.000Z`.
- **Idempotency guard:** a value that already carries an explicit offset/`Z` is an absolute instant — pass it through verbatim (`new Date(v).toISOString()`), never re-interpret. This is what makes UI ISO writes and re-runs safe.
- **Source-timezone precedence (non-UI writes):** `Contact.timezone` → `Workspace.timezone` → `UTC`. Resolve via `normalizeStoredTimezone` (offset↔IANA) then `resolveFilterTimezone` (validate/fallback). Never invent new timezone logic.
- **Filter timezone:** filter surfaces already stamp the browser zone into `contactFilterCriteriaSchema.timezone` (Phase 1). Threading it into the custom-field predicate is the only gap.
- **Display precedence:** UI pickers display **browser-local**; variable substitution renders **workspace timezone**.
- **Read-surface contract (where stored ISO is read back):**
  - **Public API** (`listContactCustomFields` → `authenticated.ts` / `workspace-token.ts`): returns the **canonical UTC ISO** verbatim — no formatter. Consumers receive an unambiguous absolute instant. Locked by a regression test only.
  - **CSV export** (`export-contacts.ts`): formats date/datetime cells in the **workspace timezone** (matches variable substitution — the export is a workspace artifact, not a per-viewer view).
  - **Contact-detail panel** (`contact-detail.tsx`): displays in **browser-local** and its inline editor round-trips through the ISO picker (`saveFormat="iso"`).
  - One shared formatter — `formatCustomFieldValueInTimeZone(type, value, timezone)` in `@chatbotx.io/utils/datetime` — serves CSV (workspace tz), contact-detail (browser tz), and variable rendering (workspace tz). The API path uses **no** formatter.
- **No `any`.** Use `unknown` + narrowing or generics. Exported functions get explicit param/return types.
- **No direct `db` in `apps/`/`integrations/`** (AGENTS.md #9). All writes go through `contactCustomFieldService` (business layer). Existing direct writes are the bug being fixed.
- **i18n mandatory** (AGENTS.md #7) — no new hardcoded user-facing strings.
- **No dynamic `import()`** (breaks tsdown build).
- **Immutability:** build new objects; never mutate inputs.
- **SQL safety:** only bind values through Drizzle `sql` template parameters (`${value}`) — never string-concatenate user input.
- **Migration safety (AGENTS.md):** GENERATE and INSPECT migration SQL only. **NEVER run `db:migrate`** — stop and wait for explicit user approval, even though this plan lists it as a verification step.
- **Per-package tests:** `pnpm --filter <pkg> test` runs `vitest run --passWithNoTests`. Vitest has `globals: false` — every test file must `import { describe, expect, test } from "vitest"`.
- **Lint/typecheck before "done":** `pnpm lint` and `pnpm --filter <pkg> check-types` for every touched package. Use `pnpm fix` for formatting.
- **Custom-field temporal types:** exactly two — `customFieldTypes.enum.date` and `customFieldTypes.enum.datetime` (`@chatbotx.io/database/partials`).

---

## File Structure

**Phase 0 — shared engine**
- Create `packages/utils/src/datetime.ts` — pure conversion helpers (moved from database), `hasExplicitOffset` now exported, plus the shared read-surface display formatter `formatCustomFieldValueInTimeZone`.
- Create `packages/utils/__tests__/datetime.test.ts`.
- Modify `packages/utils/package.json` — add `date-fns`/`date-fns-tz` deps + `./datetime` export.
- Modify `packages/database/src/queries/contact-filter/timezone.ts` — becomes a thin re-export shim.

**Phase 1 — write normalizer + service consolidation**
- Create `packages/business/src/contact-custom-field/normalize.ts` — type-keyed storage normalizer + source-timezone resolver.
- Create `packages/business/__tests__/contact-custom-field-normalize.test.ts`.
- Modify `packages/business/src/contact-custom-field/service.ts` — `setValues` fetches `type`, normalizes, resolves tz lazily.

**Phase 2 — migrate bypass write sites** (13 sites → `setValues`).
- Task 2.5 — **contact import (site 5) browser-timezone plumbing** (Option 2): capture the importer's browser timezone in the import form and thread it through request → meta → job so bulk CSV `date`/`datetime` cells store as UTC ISO. Files: `apps/builder/src/features/contacts/import-contact-form.tsx`, `.../schemas/contact-import.ts`, `packages/database/src/partials/import.ts`, `.../actions/import-contacts.action.ts`, `.../contact-import.service.ts`, `apps/worker/src/default/handlers/imports/validations/custom-field-value.ts`, `apps/worker/src/default/handlers/imports/handler/contacts/handler.ts`; test `apps/worker/__tests__/custom-field-value.test.ts`.

**Phase 3 — filter predicate timezone threading (§4.3/§4.4)**
- Modify `packages/database/src/queries/contact-filter/custom-field-predicates.ts` — `buildDatetimeCustomFieldPredicate` becomes timezone-aware; `buildCustomFieldWhere` gains a `timezone` param.
- Modify `packages/database/src/queries/contact-filter/index.ts:463` — pass `timezone`.
- Modify `packages/database/__tests__/contact-filter.test.ts` — datetime custom-field predicate assertions.

**Phase 4 — variable render workspace-tz (§4.5)**
- Modify `packages/variables/src/utils.ts` — export `renderCustomFieldValue`, delegating to the shared `formatCustomFieldValueInTimeZone`.
- Modify `packages/variables/src/contact-variable.ts:135-138` — type-aware substitution.
- Create `packages/variables/__tests__/render-custom-field-value.test.ts`.

**Phase 4B — read surfaces (§4.5b) — where stored ISO is read back**
- Create `apps/builder/__tests__/list-contact-fields-iso.test.ts` — API canonical-ISO regression test (no code change to the query; lock the contract).
- Modify `apps/worker/src/default/handlers/export-contacts.ts` — extend the `custom` `SelectedField` with `customFieldType`, capture `type` in `buildSelectedFields`, load workspace timezone once, format cells via `formatCustomFieldValueInTimeZone`.
- Create `apps/worker/__tests__/export-contacts-datetime.test.ts`.
- Modify `apps/builder/src/features/contacts/contact-detail.tsx:264-277,145-152` — browser-local display on `value`, raw ISO on `formValue`.
- Modify `packages/ui/src/components/form/date-picker-field.tsx` — make `DatePickerField` honor its existing `saveFormat?: "formatted" | "iso"` prop at runtime, mirroring `DateTimePickerField`.
- Modify `apps/builder/src/features/bot-fields/account-field-value-input.tsx` — add a `saveFormat?: "formatted" | "iso"` prop (default `"formatted"`) forwarded to the date/datetime pickers (edit round-trip).
- Modify `apps/builder/src/features/contacts/edit-contact-field.tsx` — pass `saveFormat="iso"` for date/datetime custom fields (edit round-trip). *(These three land WITH the contact-detail change: `DatePickerField` must actually consume `saveFormat`, and both temporal pickers must emit/consume ISO for the `formValue` round-trip to work.)*

**Phase 5 — UI pickers emit UTC ISO (§4.6)**
- Modify `apps/builder/src/features/contacts/components/add-custom-field-dialog.tsx:189-200` — `saveFormat="iso"` (add/create path).

**Phase 6 — worker formatDate read tz-aware (§4.7)**
- Modify `apps/builder/src/features/flows/react-flow/steps/format-date/editor.tsx` — restrict the output field picker to text custom fields (`shortText`/`longText`), because the step produces a display string.
- Modify `apps/worker/src/integration/handlers/tool-handler.ts` (formatDate step) — reformat via `formatInTimeZone`, route the write through `contactCustomFieldService.setValues`, and no-op if an existing flow targets a temporal output field.

**Phase 7 — legacy backfill migration (§4.8)**
- Modify `packages/utils/__tests__/datetime.test.ts` — lock the exact backfill vectors (incl. DST) as the oracle the migration SQL reproduces.
- Create a data-only Drizzle migration `packages/database/drizzle/<timestamp>_backfill_custom_field_datetime_utc/migration.sql` — two idempotent `AT TIME ZONE` UPDATEs (datetime + date). Auto-runs on `db:migrate`; GENERATE/INSPECT only, applied after explicit approval.

---

## PHASE 0 — Shared Datetime Engine

### Task 0.1: Move conversion helpers into `@chatbotx.io/utils/datetime`

**Files:**
- Create: `packages/utils/src/datetime.ts`
- Test: `packages/utils/__tests__/datetime.test.ts`
- Modify: `packages/utils/package.json`

**Interfaces:**
- Produces:
  - `DEFAULT_FILTER_TIMEZONE: "UTC"`
  - `resolveFilterTimezone(timezone: string | null | undefined): string`
  - `hasExplicitOffset(value: string): boolean` *(newly exported)*
  - `filterValueToUtcIso(value: string, timezone: string): string`
  - `filterValueToUtcDayStartIso(value: string, timezone: string): string`
  - `filterValueToUtcDayEndIso(value: string, timezone: string): string`
  - `DISPLAY_DATE_PATTERN: "yyyy-MM-dd"`
  - `DISPLAY_DATETIME_PATTERN: "yyyy-MM-dd HH:mm:ss"`
  - `formatCustomFieldValueInTimeZone(type: string, value: string | null | undefined, timezone: string): string` — the one read-surface display formatter. `type` is typed `string` (NOT `CustomFieldType`) on purpose: `@chatbotx.io/utils` must not import `@chatbotx.io/database` (database already imports utils via the Task 0.2 shim; the reverse would be a cycle). Callers pass their `CustomFieldType` (a string-literal union, assignable to `string`).

- [ ] **Step 1: Add dependencies + subpath export to `packages/utils/package.json`**

In `dependencies` (keep alphabetical), add the two libs at the versions already used across the repo:

```json
  "dependencies": {
    "@t3-oss/env-core": "^0.13.11",
    "date-fns": "^4.4.0",
    "date-fns-tz": "^3.2.0",
    "uuniq": "^1.3.20",
    "zod": "^4.3.6"
  },
```

In `exports`, add the `./datetime` entry (mirrors the existing per-file pattern):

```json
  "exports": {
    ".": "./src/index.ts",
    "./ai": "./src/ai.ts",
    "./crypto": "./src/crypto.ts",
    "./datetime": "./src/datetime.ts",
    "./id": "./src/id.ts",
    "./zod": "./src/zod.ts"
  },
```

- [ ] **Step 2: Install so the workspace links the new deps**

Run: `CI=true pnpm install --no-frozen-lockfile`
Expected: completes without prompting; `date-fns` + `date-fns-tz` resolve for `@chatbotx.io/utils`.

- [ ] **Step 3: Write the failing test**

Create `packages/utils/__tests__/datetime.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import {
  DEFAULT_FILTER_TIMEZONE,
  filterValueToUtcDayEndIso,
  filterValueToUtcDayStartIso,
  filterValueToUtcIso,
  formatCustomFieldValueInTimeZone,
  hasExplicitOffset,
  resolveFilterTimezone,
} from "../src/datetime"

const VN = "Asia/Ho_Chi_Minh" // UTC+7, no DST

describe("resolveFilterTimezone", () => {
  test("returns UTC when absent", () => {
    expect(resolveFilterTimezone(undefined)).toBe(DEFAULT_FILTER_TIMEZONE)
    expect(resolveFilterTimezone(null)).toBe("UTC")
    expect(resolveFilterTimezone("")).toBe("UTC")
  })

  test("passes through a valid IANA zone and falls back on garbage", () => {
    expect(resolveFilterTimezone(VN)).toBe(VN)
    expect(resolveFilterTimezone("Not/AZone")).toBe("UTC")
  })
})

describe("hasExplicitOffset", () => {
  test.each(["2026-07-22T08:30:00Z", "2026-07-22T15:30:00+07:00", "2026-07-22T15:30:00+0700"])(
    "true for offset-bearing %s",
    (value) => expect(hasExplicitOffset(value)).toBe(true),
  )

  test.each(["2026-07-22", "2026-07-22 15:30", "2026-07-22T15:30:00"])(
    "false for naive %s",
    (value) => expect(hasExplicitOffset(value)).toBe(false),
  )
})

describe("filterValueToUtcIso (datetime)", () => {
  test("interprets a naive wall-clock in the given zone", () => {
    expect(filterValueToUtcIso("2026-07-22 15:30", VN)).toBe("2026-07-22T08:30:00.000Z")
    expect(filterValueToUtcIso("2026-07-22T15:30:00", VN)).toBe("2026-07-22T08:30:00.000Z")
  })

  test("passes an offset-bearing value through verbatim", () => {
    expect(filterValueToUtcIso("2026-07-22T08:30:00.000Z", VN)).toBe("2026-07-22T08:30:00.000Z")
  })
})

describe("filterValueToUtcDayStartIso / DayEndIso (date)", () => {
  test("start-of-day in zone becomes the UTC instant", () => {
    expect(filterValueToUtcDayStartIso("2026-07-22", VN)).toBe("2026-07-21T17:00:00.000Z")
  })

  test("day end is the next midnight in zone (DST-safe next-date, not +24h)", () => {
    expect(filterValueToUtcDayEndIso("2026-07-22", VN)).toBe("2026-07-22T17:00:00.000Z")
  })

  test("takes only the date part when a time component is present", () => {
    expect(filterValueToUtcDayStartIso("2026-07-22 15:30", VN)).toBe("2026-07-21T17:00:00.000Z")
  })
})

describe("formatCustomFieldValueInTimeZone (read-surface display)", () => {
  test("datetime renders the stored UTC instant as wall-clock in the target zone", () => {
    expect(
      formatCustomFieldValueInTimeZone("datetime", "2026-07-22T08:30:00.000Z", VN),
    ).toBe("2026-07-22 15:30:00")
  })

  test("date renders the calendar day in the target zone", () => {
    expect(
      formatCustomFieldValueInTimeZone("date", "2026-07-21T17:00:00.000Z", VN),
    ).toBe("2026-07-22")
  })

  test("UTC target zone renders the raw instant", () => {
    expect(
      formatCustomFieldValueInTimeZone("datetime", "2026-07-22T08:30:00.000Z", "UTC"),
    ).toBe("2026-07-22 08:30:00")
  })

  test("non-temporal types stringify verbatim (no zone applied)", () => {
    expect(formatCustomFieldValueInTimeZone("shortText", "hello", VN)).toBe("hello")
    expect(formatCustomFieldValueInTimeZone("number", "42", VN)).toBe("42")
  })

  test("null / empty values render as empty string", () => {
    expect(formatCustomFieldValueInTimeZone("date", null, VN)).toBe("")
    expect(formatCustomFieldValueInTimeZone("datetime", "", VN)).toBe("")
    expect(formatCustomFieldValueInTimeZone("datetime", undefined, VN)).toBe("")
  })

  test("an unparseable stored value falls back to the raw string (never throws)", () => {
    expect(formatCustomFieldValueInTimeZone("datetime", "not-a-date", VN)).toBe("not-a-date")
  })
})
```

- [ ] **Step 4: Run the test — expect failure (module missing)**

Run: `pnpm --filter @chatbotx.io/utils test datetime`
Expected: FAIL — cannot resolve `../src/datetime`.

- [ ] **Step 5: Create `packages/utils/src/datetime.ts`**

Copy the current Phase 1 implementation verbatim, but **export** `hasExplicitOffset` (it is private today):

```ts
import { addDays, format, parseISO } from "date-fns"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

/**
 * Timezone conversion engine for date/datetime values.
 *
 * Naive wall-clock strings (no offset) are interpreted in the caller-supplied
 * timezone and converted to an absolute UTC instant here in JS, so downstream
 * SQL compares already-UTC `timestamptz` columns against plain UTC literals —
 * no per-row `date_trunc`/`AT TIME ZONE`, keeping columns index-friendly.
 *
 * A value that already carries an explicit offset/`Z` is an absolute instant and
 * is used verbatim (never re-interpreted). This guard is what makes UI ISO
 * writes and migration re-runs idempotent.
 */

export const DEFAULT_FILTER_TIMEZONE = "UTC"

const OFFSET_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/
const DATE_PART_LENGTH = 10 // "YYYY-MM-DD"

/**
 * Validate an IANA timezone name, falling back to UTC when absent or
 * unrecognized. Guards against an invalid zone reaching `Intl`/date-fns-tz.
 */
export function resolveFilterTimezone(
  timezone: string | null | undefined,
): string {
  if (!timezone) {
    return DEFAULT_FILTER_TIMEZONE
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return timezone
  } catch {
    return DEFAULT_FILTER_TIMEZONE
  }
}

/** True when the value already carries an explicit `Z`/±HH:MM offset. */
export function hasExplicitOffset(value: string): boolean {
  return OFFSET_SUFFIX_PATTERN.test(value)
}

// date-fns-tz expects the "T" separator; UI/webhooks may send a space.
const toLocalIso = (value: string): string => value.replace(" ", "T")

const datePartOf = (value: string): string => value.slice(0, DATE_PART_LENGTH)

/**
 * Absolute UTC instant (ISO string) of a value: interpreted in `timezone` when
 * naive, or used as-is when it already carries an offset.
 */
export function filterValueToUtcIso(value: string, timezone: string): string {
  if (hasExplicitOffset(value)) {
    return new Date(value).toISOString()
  }
  return fromZonedTime(toLocalIso(value), timezone).toISOString()
}

/** Start of the calendar day of `value` (midnight in `timezone`) as a UTC instant. */
export function filterValueToUtcDayStartIso(
  value: string,
  timezone: string,
): string {
  return fromZonedTime(`${datePartOf(value)}T00:00:00`, timezone).toISOString()
}

/**
 * Next midnight in `timezone` after the calendar day of `value`, as a UTC
 * instant — the exclusive upper bound for day-based equality. Computed from the
 * next calendar date (not `+24h`) so it stays correct across DST transitions.
 */
export function filterValueToUtcDayEndIso(
  value: string,
  timezone: string,
): string {
  const nextDay = format(addDays(parseISO(datePartOf(value)), 1), "yyyy-MM-dd")
  return fromZonedTime(`${nextDay}T00:00:00`, timezone).toISOString()
}

/** Display patterns for reading a stored UTC instant back as wall-clock text. */
export const DISPLAY_DATE_PATTERN = "yyyy-MM-dd"
export const DISPLAY_DATETIME_PATTERN = "yyyy-MM-dd HH:mm:ss"

/**
 * Map of temporal field type → display pattern. `type` is a plain string
 * (not `CustomFieldType`) so this module stays free of a `@chatbotx.io/database`
 * import — database depends on utils, so the reverse edge would be a cycle.
 * Any type not in this map is opaque and stringifies verbatim.
 */
const DISPLAY_PATTERNS: Record<string, string> = {
  date: DISPLAY_DATE_PATTERN,
  datetime: DISPLAY_DATETIME_PATTERN,
}

/**
 * Render a stored custom-field value for a read surface (CSV export, contact
 * detail, variable substitution). Temporal values — stored as absolute UTC ISO —
 * are rendered as wall-clock text in `timezone`; every other type is returned
 * as-is. Null/empty → `""`. An unparseable value falls back to the raw string so
 * a bad row never throws in a render/export path.
 *
 * The caller decides the zone: workspace timezone for CSV/variables, browser
 * timezone for the contact-detail panel.
 */
export function formatCustomFieldValueInTimeZone(
  type: string,
  value: string | null | undefined,
  timezone: string,
): string {
  if (value == null || value === "") {
    return ""
  }
  const pattern = DISPLAY_PATTERNS[type]
  if (!pattern) {
    return value
  }
  try {
    return formatInTimeZone(new Date(value), resolveFilterTimezone(timezone), pattern)
  } catch {
    return value
  }
}
```

- [ ] **Step 6: Run the test — expect pass**

Run: `pnpm --filter @chatbotx.io/utils test datetime`
Expected: PASS (all cases).

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @chatbotx.io/utils check-types`
Expected: no errors.

```bash
git add packages/utils/package.json packages/utils/src/datetime.ts packages/utils/__tests__/datetime.test.ts pnpm-lock.yaml
git commit -m "feat(utils): add shared UTC datetime conversion engine"
```

---

### Task 0.2: Reduce database `timezone.ts` to a re-export shim

**Files:**
- Modify: `packages/database/src/queries/contact-filter/timezone.ts`

**Interfaces:**
- Consumes: everything from Task 0.1.
- Produces: the same public names as before (so `predicates.ts`, `custom-field-predicates.ts`, and `contact-filter/index.ts` re-exports keep working unchanged).

- [ ] **Step 1: Replace the file body with a re-export**

Overwrite `packages/database/src/queries/contact-filter/timezone.ts`:

```ts
/**
 * Contact-filter timezone helpers now live in the shared engine so the write
 * path (business) and the query path (database) share one implementation.
 * Re-exported here to preserve this module's existing public surface.
 * @see `@chatbotx.io/utils/datetime`
 */
export {
  DEFAULT_FILTER_TIMEZONE,
  filterValueToUtcDayEndIso,
  filterValueToUtcDayStartIso,
  filterValueToUtcIso,
  hasExplicitOffset,
  resolveFilterTimezone,
} from "@chatbotx.io/utils/datetime"
```

- [ ] **Step 2: Run the existing contact-filter suite — expect pass (no behavior change)**

Run: `pnpm --filter @chatbotx.io/database test contact-filter`
Expected: PASS — same output as before the shim.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @chatbotx.io/database check-types`
Expected: no errors.

```bash
git add packages/database/src/queries/contact-filter/timezone.ts
git commit -m "refactor(database): re-export datetime engine from utils"
```

---

## PHASE 1 — Write Normalizer + Service Consolidation

### Task 1.1: Create the storage normalizer

**Files:**
- Create: `packages/business/src/contact-custom-field/normalize.ts`
- Test: `packages/business/__tests__/contact-custom-field-normalize.test.ts`

**Interfaces:**
- Consumes: `filterValueToUtcIso`, `filterValueToUtcDayStartIso`, `hasExplicitOffset`, `resolveFilterTimezone` from `@chatbotx.io/utils/datetime`; `normalizeStoredTimezone` from `@chatbotx.io/business/contact-locale`; `CustomFieldType`, `customFieldTypes` from `@chatbotx.io/database/partials`; `DatabaseClient` from `@chatbotx.io/database/client`.
- Produces:
  - `type SourceTimezoneResolver = () => Promise<string>`
  - `normalizeCustomFieldValueForStorage(type: CustomFieldType, value: string, resolveTimezone: SourceTimezoneResolver): Promise<string>`
  - `createSourceTimezoneResolver(input: { tx: DatabaseClient; workspaceId: string; contactId: string; override?: string | null }): SourceTimezoneResolver`

- [ ] **Step 1: Write the failing test**

Create `packages/business/__tests__/contact-custom-field-normalize.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
} from "../src/contact-custom-field/normalize"

const VN = "Asia/Ho_Chi_Minh"
const resolveVN = () => Promise.resolve(VN)

describe("normalizeCustomFieldValueForStorage", () => {
  test("datetime: naive wall-clock → UTC instant", async () => {
    expect(
      await normalizeCustomFieldValueForStorage("datetime", "2026-07-22 15:30", resolveVN),
    ).toBe("2026-07-22T08:30:00.000Z")
  })

  test("date: naive day → UTC start-of-day instant", async () => {
    expect(
      await normalizeCustomFieldValueForStorage("date", "2026-07-22", resolveVN),
    ).toBe("2026-07-21T17:00:00.000Z")
  })

  test("already-UTC value passes through unchanged (idempotent)", async () => {
    expect(
      await normalizeCustomFieldValueForStorage("datetime", "2026-07-22T08:30:00.000Z", resolveVN),
    ).toBe("2026-07-22T08:30:00.000Z")
    expect(
      await normalizeCustomFieldValueForStorage("date", "2026-07-21T17:00:00.000Z", resolveVN),
    ).toBe("2026-07-21T17:00:00.000Z")
  })

  test("non-temporal types are returned verbatim without resolving a timezone", async () => {
    const reject: () => Promise<string> = () =>
      Promise.reject(new Error("timezone must not be resolved"))
    expect(await normalizeCustomFieldValueForStorage("shortText", "hello", reject)).toBe("hello")
    expect(await normalizeCustomFieldValueForStorage("number", "42", reject)).toBe("42")
  })

  test("empty string stays empty (no conversion)", async () => {
    expect(await normalizeCustomFieldValueForStorage("date", "", resolveVN)).toBe("")
    expect(await normalizeCustomFieldValueForStorage("datetime", "   ", resolveVN)).toBe("")
  })
})

describe("createSourceTimezoneResolver", () => {
  const makeTx = (contactTz: string | null, workspaceTz: string | null) =>
    ({
      query: {
        contactModel: { findFirst: () => Promise.resolve(contactTz ? { timezone: contactTz } : undefined) },
        workspaceModel: { findFirst: () => Promise.resolve(workspaceTz ? { timezone: workspaceTz } : undefined) },
      },
    }) as never

  test("prefers contact timezone", async () => {
    const resolve = createSourceTimezoneResolver({
      tx: makeTx(VN, "UTC"),
      workspaceId: "w1",
      contactId: "c1",
    })
    expect(await resolve()).toBe(VN)
  })

  test("falls back to workspace timezone when contact has none", async () => {
    const resolve = createSourceTimezoneResolver({
      tx: makeTx(null, VN),
      workspaceId: "w1",
      contactId: "c1",
    })
    expect(await resolve()).toBe(VN)
  })

  test("falls back to UTC when neither is set", async () => {
    const resolve = createSourceTimezoneResolver({
      tx: makeTx(null, null),
      workspaceId: "w1",
      contactId: "c1",
    })
    expect(await resolve()).toBe("UTC")
  })

  test("an explicit override wins and skips the DB lookup", async () => {
    const throwingTx = {
      query: {
        contactModel: { findFirst: () => { throw new Error("must not query") } },
        workspaceModel: { findFirst: () => { throw new Error("must not query") } },
      },
    } as never
    const resolve = createSourceTimezoneResolver({
      tx: throwingTx,
      workspaceId: "w1",
      contactId: "c1",
      override: "+07:00",
    })
    expect(await resolve()).toBe(VN)
  })

  // The override accepts whatever a caller might hold: an IANA name, a numeric
  // UTC offset ("+7", "7", "+07:00"), or an already-stored legacy string. All go
  // through `normalizeStoredTimezone` → `resolveFilterTimezone`, so a malformed
  // override degrades to UTC instead of silently shifting the instant.
  test.each([
    ["+07:00"],
    ["+7"],
    ["7"],
  ])("normalizes a numeric UTC+7 override %s to a +7 zone", async (override) => {
    const throwingTx = {
      query: {
        contactModel: { findFirst: () => { throw new Error("must not query") } },
        workspaceModel: { findFirst: () => { throw new Error("must not query") } },
      },
    } as never
    const resolve = createSourceTimezoneResolver({
      tx: throwingTx,
      workspaceId: "w1",
      contactId: "c1",
      override,
    })
    // Assert on the *offset*, not a specific IANA name: normalizeStoredTimezone
    // may resolve "+7" to any UTC+7 zone. 2026-07-22T08:30Z is 15:30 at +7.
    const { formatInTimeZone } = await import("date-fns-tz")
    expect(
      formatInTimeZone(new Date("2026-07-22T08:30:00.000Z"), await resolve(), "HH:mm"),
    ).toBe("15:30")
  })

  test("a garbage override falls back to UTC (no instant shift)", async () => {
    const throwingTx = {
      query: {
        contactModel: { findFirst: () => { throw new Error("must not query") } },
        workspaceModel: { findFirst: () => { throw new Error("must not query") } },
      },
    } as never
    const resolve = createSourceTimezoneResolver({
      tx: throwingTx,
      workspaceId: "w1",
      contactId: "c1",
      override: "Not/AZone",
    })
    expect(await resolve()).toBe("UTC")
  })

  test("resolves at most once (memoized)", async () => {
    let calls = 0
    const countingTx = {
      query: {
        contactModel: { findFirst: () => { calls += 1; return Promise.resolve({ timezone: VN }) } },
        workspaceModel: { findFirst: () => Promise.resolve({ timezone: "UTC" }) },
      },
    } as never
    const resolve = createSourceTimezoneResolver({ tx: countingTx, workspaceId: "w1", contactId: "c1" })
    await resolve()
    await resolve()
    expect(calls).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm --filter @chatbotx.io/business test contact-custom-field-normalize`
Expected: FAIL — cannot resolve `../src/contact-custom-field/normalize`.

- [ ] **Step 3: Create `packages/business/src/contact-custom-field/normalize.ts`**

```ts
import type { DatabaseClient } from "@chatbotx.io/database/client"
import { type CustomFieldType, customFieldTypes } from "@chatbotx.io/database/partials"
import {
  filterValueToUtcDayStartIso,
  filterValueToUtcIso,
  hasExplicitOffset,
  resolveFilterTimezone,
} from "@chatbotx.io/utils/datetime"
import { normalizeStoredTimezone } from "../contact-locale"

/** Lazily resolves the source timezone; awaited only when a temporal field exists. */
export type SourceTimezoneResolver = () => Promise<string>

/** Converts one naive wall-clock value into its stored UTC representation. */
type StorageNormalizer = (value: string, timezone: string) => string

const normalizeDatetime: StorageNormalizer = (value, timezone) =>
  filterValueToUtcIso(value, timezone)

const normalizeDate: StorageNormalizer = (value, timezone) =>
  filterValueToUtcDayStartIso(value, timezone)

// Only these two field types carry timezone semantics. Everything else is opaque.
const STORAGE_NORMALIZERS: Partial<Record<CustomFieldType, StorageNormalizer>> = {
  [customFieldTypes.enum.date]: normalizeDate,
  [customFieldTypes.enum.datetime]: normalizeDatetime,
}

/**
 * Normalize a custom-field value for storage.
 * - Non-temporal types: returned verbatim (the resolver is never awaited).
 * - Empty/whitespace: returned as an empty string.
 * - Values already carrying an offset/`Z`: passed through (idempotent).
 * - Naive temporal values: interpreted in the resolved source timezone.
 */
export async function normalizeCustomFieldValueForStorage(
  type: CustomFieldType,
  value: string,
  resolveTimezone: SourceTimezoneResolver,
): Promise<string> {
  const normalizer = STORAGE_NORMALIZERS[type]
  if (!normalizer) {
    return value
  }

  const trimmed = value.trim()
  if (trimmed === "") {
    return ""
  }
  if (hasExplicitOffset(trimmed)) {
    return new Date(trimmed).toISOString()
  }

  const timezone = await resolveTimezone()
  return normalizer(trimmed, timezone)
}

async function loadSourceTimezone(input: {
  tx: DatabaseClient
  workspaceId: string
  contactId: string
  override?: string | null
}): Promise<string> {
  if (input.override) {
    return resolveFilterTimezone(normalizeStoredTimezone(input.override))
  }

  const [contact, workspace] = await Promise.all([
    input.tx.query.contactModel.findFirst({
      where: { id: input.contactId },
      columns: { timezone: true },
    }),
    input.tx.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
      columns: { timezone: true },
    }),
  ])

  const stored = contact?.timezone ?? workspace?.timezone ?? null
  return resolveFilterTimezone(normalizeStoredTimezone(stored))
}

/**
 * Build a memoized source-timezone resolver for one write. The DB lookup runs at
 * most once, and only if a temporal field is actually present.
 */
export function createSourceTimezoneResolver(input: {
  tx: DatabaseClient
  workspaceId: string
  contactId: string
  override?: string | null
}): SourceTimezoneResolver {
  let cached: Promise<string> | undefined
  return () => {
    cached ??= loadSourceTimezone(input)
    return cached
  }
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm --filter @chatbotx.io/business test contact-custom-field-normalize`
Expected: PASS.

> Note: `normalizeStoredTimezone("+07:00")` must resolve to `Asia/Ho_Chi_Minh` (or another UTC+7 IANA zone) for the override test. If the existing `offsetToTimezoneMap` maps `+07:00` to a different equivalent zone, adjust the expected value in the test to that zone — the *offset* is what matters.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @chatbotx.io/business check-types`
Expected: no errors.

```bash
git add packages/business/src/contact-custom-field/normalize.ts packages/business/__tests__/contact-custom-field-normalize.test.ts
git commit -m "feat(business): add timezone-aware custom-field storage normalizer"
```

---

### Task 1.2: Wire the normalizer into `setValues`

**Files:**
- Modify: `packages/business/src/contact-custom-field/service.ts:61-142`

**Interfaces:**
- Consumes: `normalizeCustomFieldValueForStorage`, `createSourceTimezoneResolver` from `./normalize` (Task 1.1).
- Produces: `setValues(input: SetValuesInput, tx?: DatabaseClient): Promise<void>` where `SetValuesInput` gains an optional `sourceTimezone?: string`. All callers keep working (new field is optional; ISO values pass through untouched).

- [ ] **Step 1: Extend `SetValuesInput` and the imports**

Add the import near the top of `service.ts` (below the existing imports):

```ts
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
} from "./normalize"
```

Change the `SetValuesInput` type:

```ts
type SetValuesInput = {
  workspaceId: string
  contactId: string
  fields: Array<{ customFieldId: string; value: string }>
  /**
   * Source timezone for naive date/datetime values written outside the UI
   * (webhook/worker). When omitted, resolved from Contact → Workspace → UTC.
   * Values already carrying an offset/`Z` ignore this entirely.
   *
   * Accepted formats — all normalized through `normalizeStoredTimezone` →
   * `resolveFilterTimezone`, so a caller may pass whatever it has on hand:
   *   - IANA name: `"Asia/Ho_Chi_Minh"`, `"UTC"`
   *   - numeric UTC offset: `"+07:00"`, `"+7"`, `"7"`
   * Anything unrecognized degrades to UTC (never a silent instant shift).
   * Do NOT pre-format or hand-roll offset parsing at the call site — pass the
   * raw stored/known zone string and let the service normalize it.
   */
  sourceTimezone?: string
}
```

- [ ] **Step 2: Fetch the field `type` and normalize before diffing**

Replace the body of `setValues` from the `customFields` fetch through the `changedFields` construction. Current (lines 65-95):

```ts
    const { workspaceId, contactId, fields } = input
    const customFieldIds = fields.map((f) => f.customFieldId)

    const customFields = await tx.query.customFieldModel.findMany({
      where: { workspaceId, id: { in: customFieldIds } },
      columns: { id: true, name: true },
    })

    if (customFields.length === 0) {
      return
    }

    const existingValues = await tx.query.contactCustomFieldModel.findMany({
      where: { contactId, customFieldId: { in: customFieldIds } },
    })

    const changedFields = customFields.flatMap((customField) => {
      const field = fields.find((f) => f.customFieldId === customField.id)
      if (!field) {
        return []
      }
      const existing = existingValues.find(
        (value) => value.customFieldId === customField.id,
      )
      if (existing?.value === field.value) {
        return []
      }
      return [
        { customField, field, existing, oldValue: existing?.value ?? null },
      ]
    })
```

New:

```ts
    const { workspaceId, contactId, fields } = input
    const customFieldIds = fields.map((f) => f.customFieldId)

    const customFields = await tx.query.customFieldModel.findMany({
      where: { workspaceId, id: { in: customFieldIds } },
      columns: { id: true, name: true, type: true },
    })

    if (customFields.length === 0) {
      return
    }

    const existingValues = await tx.query.contactCustomFieldModel.findMany({
      where: { contactId, customFieldId: { in: customFieldIds } },
    })

    const resolveSourceTimezone = createSourceTimezoneResolver({
      tx,
      workspaceId,
      contactId,
      override: input.sourceTimezone,
    })

    const normalizedFields = await Promise.all(
      customFields.map(async (customField) => {
        const field = fields.find((f) => f.customFieldId === customField.id)
        if (!field) {
          return null
        }
        const value = await normalizeCustomFieldValueForStorage(
          customField.type,
          field.value,
          resolveSourceTimezone,
        )
        return { customField, value }
      }),
    )

    const changedFields = normalizedFields.flatMap((entry) => {
      if (!entry) {
        return []
      }
      const { customField, value } = entry
      const existing = existingValues.find(
        (row) => row.customFieldId === customField.id,
      )
      if (existing?.value === value) {
        return []
      }
      return [{ customField, value, existing, oldValue: existing?.value ?? null }]
    })
```

- [ ] **Step 3: Use the normalized `value` in the write + emit**

In the `tx.transaction` block, the destructured `field` becomes `value`, and every `field.value` becomes `value`. Replace the transaction body (current lines 101-127):

```ts
    await tx.transaction(async (innerTx) => {
      await Promise.all(
        changedFields.map(({ customField, value, existing }) => {
          if (existing) {
            return innerTx
              .update(contactCustomFieldModel)
              .set({ value })
              .where(eq(contactCustomFieldModel.id, existing.id))
          }
          return innerTx
            .insert(contactCustomFieldModel)
            .values({
              id: createId(),
              contactId,
              customFieldId: customField.id,
              value,
            })
            .onConflictDoUpdate({
              target: [
                contactCustomFieldModel.contactId,
                contactCustomFieldModel.customFieldId,
              ],
              set: { value },
            })
        }),
      )
    })
```

And the emit loop (current lines 129-139) — replace `field.value` with `value`:

```ts
    for (const { customField, value, oldValue } of changedFields) {
      emitCustomFieldChanged(
        workspaceId,
        contactId,
        customField.id,
        customField.name,
        oldValue,
        value,
        // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
      ).catch(() => {})
    }
```

- [ ] **Step 4: Add a service-level integration test with a fake `tx`**

Create `packages/business/__tests__/contact-custom-field-set-values.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest"

// Isolate the service from the real DB client / events / cache.
vi.mock("@chatbotx.io/events", () => ({ emitCustomFieldChanged: () => Promise.resolve() }))
vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...args: unknown[]) => ({ and: args }),
}))

const { contactCustomFieldService } = await import("../src/contact-custom-field/service")

type Written = { customFieldId: string; value: string }

const makeTx = (opts: {
  fields: Array<{ id: string; name: string; type: string }>
  existing: Array<{ id: string; customFieldId: string; value: string }>
  contactTz: string | null
  workspaceTz: string | null
  written: Written[]
}) => {
  const insertChain = (customFieldId: string) => ({
    values: (row: { value: string }) => {
      opts.written.push({ customFieldId, value: row.value })
      return { onConflictDoUpdate: () => Promise.resolve() }
    },
  })
  return {
    query: {
      customFieldModel: { findMany: () => Promise.resolve(opts.fields) },
      contactCustomFieldModel: { findMany: () => Promise.resolve(opts.existing) },
      contactModel: { findFirst: () => Promise.resolve(opts.contactTz ? { timezone: opts.contactTz } : undefined) },
      workspaceModel: { findFirst: () => Promise.resolve(opts.workspaceTz ? { timezone: opts.workspaceTz } : undefined) },
    },
    transaction: (fn: (t: unknown) => Promise<void>) =>
      fn({
        insert: () => insertChain("pending"),
        update: () => ({ set: (row: { value: string }) => ({ where: () => { opts.written.push({ customFieldId: "update", value: row.value }); return Promise.resolve() } }) }),
      }),
  } as never
}

describe("setValues normalization", () => {
  test("stores a naive datetime as a UTC instant using the contact timezone", async () => {
    const written: Written[] = []
    const tx = makeTx({
      fields: [{ id: "cf1", name: "Appointment", type: "datetime" }],
      existing: [],
      contactTz: "Asia/Ho_Chi_Minh",
      workspaceTz: "UTC",
      written,
    })
    // Fake insert chain needs the real customFieldId; patch it in.
    ;(tx as { transaction: (fn: (t: never) => Promise<void>) => Promise<void> }).transaction = (fn) =>
      fn({
        insert: () => ({
          values: (row: { customFieldId: string; value: string }) => {
            written.push({ customFieldId: row.customFieldId, value: row.value })
            return { onConflictDoUpdate: () => Promise.resolve() }
          },
        }),
      } as never)

    await contactCustomFieldService.setValues(
      { workspaceId: "w1", contactId: "c1", fields: [{ customFieldId: "cf1", value: "2026-07-22 15:30" }] },
      tx,
    )

    expect(written).toEqual([{ customFieldId: "cf1", value: "2026-07-22T08:30:00.000Z" }])
  })

  test("skips the write when the normalized value equals the existing value", async () => {
    const written: Written[] = []
    const tx = makeTx({
      fields: [{ id: "cf1", name: "Appointment", type: "datetime" }],
      existing: [{ id: "v1", customFieldId: "cf1", value: "2026-07-22T08:30:00.000Z" }],
      contactTz: "Asia/Ho_Chi_Minh",
      workspaceTz: "UTC",
      written,
    })
    await contactCustomFieldService.setValues(
      { workspaceId: "w1", contactId: "c1", fields: [{ customFieldId: "cf1", value: "2026-07-22 15:30" }] },
      tx,
    )
    expect(written).toEqual([])
  })
})
```

> If mocking `this.invalidate` (cache tags) throws in this harness, also `vi.mock` the cache module the `BaseService` uses, or stub `contactCustomFieldService.invalidate` with `vi.spyOn(...).mockResolvedValue()` before calling `setValues`. Keep the assertion on `written` intact.

- [ ] **Step 5: Run the tests — expect pass**

Run: `pnpm --filter @chatbotx.io/business test contact-custom-field`
Expected: PASS (normalize + set-values suites).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @chatbotx.io/business check-types`
Expected: no errors.

```bash
git add packages/business/src/contact-custom-field/service.ts packages/business/__tests__/contact-custom-field-set-values.test.ts
git commit -m "feat(business): normalize date/datetime custom-field values on write"
```

---

## PHASE 2 — Migrate Bypass Write Sites

Every direct `contactCustomFieldModel` write outside the service skips normalization (and often the change-event/cache-invalidation). Route them all through `contactCustomFieldService.setValues`.

### Task 2.0: Re-inventory the bypass sites (discovery)

**Files:** none (read-only).

- [ ] **Step 1: List every direct write site**

Run:
```bash
grep -rn "contactCustomFieldModel" apps/ integrations/ \
  | grep -viE "__tests__|\.test\.|import|type " \
  | grep -iE "insert|update|\.set\(|onConflict|delete"
```
Expected: the sites below (line numbers may have shifted — use the grep output as the source of truth). Known inventory:

| # | File | Note |
|---|------|------|
| 1 | `apps/builder/src/features/contacts/actions/update-contact-field.action.ts` | direct update, **no emit** (latent bug) |
| 2 | `apps/builder/src/features/contacts/actions/add-contact-custom-field.action.ts` | uses `computeUpdatedFieldValue` + `.for("update")` row lock |
| 3a | `apps/worker/src/integration/handlers/tool-handler.ts` | set-custom-field tool |
| 3b | `apps/worker/src/integration/handlers/tool-handler.ts` | **formatDate** step (read+reformat+write) — see Phase 6 |
| 4 | `apps/worker/src/trigger/services/action-executor.ts` | trigger action, **no emit** |
| 5 | `apps/worker/src/default/handlers/imports/handler/contacts/handler.ts` | CSV import — **owned by Task 2.5, not this task.** Its upstream date-awareness (`validateCustomFieldValue`) is timezone-naive today (server-local `Date.parse`); Task 2.5 makes it browser-tz-aware and **keeps the bulk `insert`** — freshly-created contacts need no change-event/cache bust, so import is a justified exception to the `setValues` routing. |
| 6 | `apps/worker/src/integration/handlers/whatsapp-flow-response.ts` | WhatsApp flow answers |
| 7 | `apps/worker/src/integration/handlers/contact.ts` | channel contact sync |
| 8 | `apps/worker/src/integration/utils/contact.ts` | shared channel util |
| 9 | `apps/worker/src/integration/handlers/spreadsheet-handler.ts` | Google Sheets sync |

- [ ] **Step 2: Record actual line numbers**

For each hit, note `file:line` — you will convert them one at a time, each its own commit.

---

### Task 2.1: Canonical conversion pattern (reference — do not skip)

Every site follows one of three mechanics. Read all three before touching a site.

**Mechanic A — plain direct write.** Replace the insert/update (+ any manual `onConflictDoUpdate`, cache bump, or missing emit) with:

```ts
await contactCustomFieldService.setValues(
  {
    workspaceId,
    contactId,
    fields: [{ customFieldId, value }],
    // Non-UI write: naive values are interpreted in Contact → Workspace tz.
    // Omit sourceTimezone unless the caller already knows the source zone.
  },
  tx, // pass the ambient transaction if the site has one; otherwise omit
)
```

Delete now-dead imports (`contactCustomFieldModel`, `createId`, `eq`) if the site no longer references them. `setValues` already emits `emitCustomFieldChanged` and invalidates cache — remove any duplicate hand-rolled versions.

**Mechanic B — compute-then-write with a row lock** (site 2). The current code reads the existing row `.for("update")`, computes a new value via `computeUpdatedFieldValue(operation, existing, input)`, then writes. `setValues` does a plain overwrite, so **pre-compute** the final value, then call `setValues`:

```ts
// 1. keep the existing read + computeUpdatedFieldValue(...) to get finalValue
// 2. replace the direct write with:
await contactCustomFieldService.setValues(
  { workspaceId, contactId, fields: [{ customFieldId, value: finalValue }] },
  tx,
)
```
Keep the `.for("update")` lock read that guards concurrent operations — only the write half changes.

**Mechanic C — batch writes.** When a site writes many fields (import/spreadsheet/flow answers), collect them into one `fields: [...]` array and make a single `setValues` call per contact — do not loop one call per field (avoids N transactions).

- [ ] **Step 1: No code — reference only. Proceed to per-site tasks.**

---

### Task 2.2: Convert site 1 — `update-contact-field.action.ts`

**Files:**
- Modify: `apps/builder/src/features/contacts/actions/update-contact-field.action.ts`

- [ ] **Step 1: Read the current site**

Run: `sed -n '90,130p' apps/builder/src/features/contacts/actions/update-contact-field.action.ts`

- [ ] **Step 2: Replace the direct write with `setValues` (Mechanic A)**

Import the service if not present:
```ts
import { contactCustomFieldService } from "@chatbotx.io/business"
```
Replace the direct `contactCustomFieldModel` update/insert with the `setValues` call from Task 2.1 Mechanic A. Remove the now-unused `contactCustomFieldModel`/`createId`/`eq`/`db` imports. This action is a UI write; the picker (Phase 5) sends ISO, so no `sourceTimezone` needed.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter builder check-types`
Expected: no errors.

- [ ] **Step 4: Run the invariant guard mentally / lint**

Run: `pnpm lint`
Expected: clean (confirms no direct `db` import remains in the app layer).

- [ ] **Step 5: Commit**

```bash
git add apps/builder/src/features/contacts/actions/update-contact-field.action.ts
git commit -m "refactor(contacts): route contact-field update through the service"
```

---

### Task 2.3: Convert site 2 — `add-contact-custom-field.action.ts`

**Files:**
- Modify: `apps/builder/src/features/contacts/actions/add-contact-custom-field.action.ts`

- [ ] **Step 1: Read the current site**

Run: `sed -n '120,300p' apps/builder/src/features/contacts/actions/add-contact-custom-field.action.ts`

- [ ] **Step 2: Apply Mechanic B**

Keep the `.for("update")` lock read and `computeUpdatedFieldValue(...)` that produce `finalValue`; replace only the write with `contactCustomFieldService.setValues(...)`. UI write → no `sourceTimezone`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter builder check-types && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/builder/src/features/contacts/actions/add-contact-custom-field.action.ts
git commit -m "refactor(contacts): route add-custom-field write through the service"
```

---

### Task 2.4: Convert worker sites 3a, 4, 6, 7, 8, 9

> **Site 5 (`imports/handler/contacts/handler.ts`) is intentionally excluded here** — it is owned by **Task 2.5**, which threads the importer's browser timezone and makes `validateCustomFieldValue` tz-aware while keeping the bulk `insert`. Do **not** convert it to `setValues` in this task.

**Files (one commit per file):**
- `apps/worker/src/integration/handlers/tool-handler.ts` (site 3a only; 3b in Phase 6)
- `apps/worker/src/trigger/services/action-executor.ts`
- `apps/worker/src/integration/handlers/whatsapp-flow-response.ts`
- `apps/worker/src/integration/handlers/contact.ts`
- `apps/worker/src/integration/utils/contact.ts`
- `apps/worker/src/integration/handlers/spreadsheet-handler.ts`

- [ ] **Step 1: For each file, read the site and apply the matching mechanic**

Run (per file): `grep -n "contactCustomFieldModel" <file>` then read ±20 lines.
- Single-field writes → Mechanic A.
- Spreadsheet/flow-answers with many fields → Mechanic C (one batched `setValues`). (Contact import is **not** in this task — see Task 2.5.)
- These are **non-UI** writes: values are naive. Leave `sourceTimezone` omitted so the resolver uses Contact → Workspace tz — this is exactly the spec's rule. Only pass `sourceTimezone` if the handler already has an authoritative source zone in hand.

- [ ] **Step 2: Remove dead imports and hand-rolled emit/cache code per file**

- [ ] **Step 3: Typecheck after each file**

Run: `pnpm --filter worker check-types`
Expected: no errors.

- [ ] **Step 4: Commit per file**

```bash
git add <file>
git commit -m "refactor(worker): route <site> custom-field write through the service"
```

- [ ] **Step 5: After all files, run the worker + invariant checks**

Run: `pnpm --filter worker test && pnpm lint`
Expected: PASS / clean.
Then dispatch the `invariant-guard` subagent on the worker diff to confirm no direct-`db` / binding / emit regressions.

---

### Task 2.5: Contact import — capture the browser timezone and store date/datetime as UTC

**Why this is a separate task from 2.4:** The CSV import path (bypass site 5) is a *second, independent* write path that never touches `contactCustomFieldService.setValues`. Its date/datetime conversion happens upstream in `validateCustomFieldValue`, which today is timezone-naive: `date` is stored verbatim (`"2026-05-19"`), and `datetime` is run through `new Date(Date.parse(value)).toISOString()`, interpreting a naive wall-clock string in the **worker's server-local zone** — non-deterministic and wrong. Per the product decision (Option 2), the fix threads the *importer's browser timezone* from the upload form to the job and makes `validateCustomFieldValue` delegate to the Phase 0 engine. The worker keeps its single bulk `insert` (freshly-created contacts have no cache/subscribers — see the Task 2.0 site-5 note), so this task is orthogonal to 2.4's `setValues` routing.

**Depends on:** Phase 0 (`@chatbotx.io/utils/datetime` must export `filterValueToUtcIso`, `filterValueToUtcDayStartIso`, and `resolveFilterTimezone`).

**Files:**
- Modify: `apps/builder/src/features/contacts/schemas/contact-import.ts` (add optional `timezone`)
- Modify: `packages/database/src/partials/import.ts` (add optional `timezone` to `contactImportMetaSchema`)
- Modify: `apps/builder/src/features/contacts/import-contact-form.tsx` (capture `getBrowserTimezone()`)
- Modify: `apps/builder/src/features/contacts/actions/import-contacts.action.ts` (thread `timezone` into meta)
- Modify: `apps/builder/src/features/contacts/contact-import.service.ts` (thread `timezone` into meta)
- Modify: `apps/worker/src/default/handlers/imports/validations/custom-field-value.ts` (make tz-aware, delegate to engine)
- Modify: `apps/worker/src/default/handlers/imports/handler/contacts/handler.ts` (resolve `importTimezone`, thread into `ContactDeps`)
- Test: `apps/worker/__tests__/custom-field-value.test.ts` (rewrite date/datetime vectors to UTC)

**Interfaces:**
- Consumes (Phase 0): `filterValueToUtcIso(value: string, timezone: string): string`, `filterValueToUtcDayStartIso(value: string, timezone: string): string` (both pass explicitly-offset values through verbatim via `hasExplicitOffset`), `resolveFilterTimezone(timezone?: string): string` (returns a valid IANA zone; defaults to `"UTC"` on absent/unrecognized).
- Produces: `validateCustomFieldValue(type: CustomFieldType, raw: string, timezone: string): string | null` — the `timezone` parameter is now **required**; every caller and test passes a resolved IANA zone. `ContactImportMeta` gains an optional `timezone?: string`.

- [ ] **Step 1: Write the failing test — tz-aware `validateCustomFieldValue` (RED)**

Replace the existing `date` and `datetime` describe blocks in `apps/worker/__tests__/custom-field-value.test.ts` with the vectors below, and add the shared timezone constant near the top of the file (just after the imports):

```ts
// Golden zone for the import-normalizer vectors: Asia/Ho_Chi_Minh is UTC+7
// year-round (no DST), so the expected UTC instants are stable.
const TZ = "Asia/Ho_Chi_Minh"

describe("validateCustomFieldValue — date (UTC day-start)", () => {
  it("stores a naive calendar date as the UTC instant of that day's start in the given zone", () => {
    // 2026-05-19 00:00 in +07 == 2026-05-18 17:00 UTC
    expect(validateCustomFieldValue("date", "2026-05-19", TZ)).toBe(
      "2026-05-18T17:00:00.000Z",
    )
  })

  it("interprets the same calendar date differently per zone", () => {
    expect(validateCustomFieldValue("date", "2026-05-19", "UTC")).toBe(
      "2026-05-19T00:00:00.000Z",
    )
  })

  it("rejects a non-date string", () => {
    expect(validateCustomFieldValue("date", "not-a-date", TZ)).toBeNull()
  })

  it("rejects an impossible calendar date", () => {
    expect(validateCustomFieldValue("date", "2026-13-01", TZ)).toBeNull()
  })

  it("returns null for an empty cell", () => {
    expect(validateCustomFieldValue("date", "", TZ)).toBeNull()
  })
})

describe("validateCustomFieldValue — datetime (UTC instant)", () => {
  it("interprets a naive wall-clock datetime in the given zone and stores UTC", () => {
    // 2026-05-19 10:00 in +07 == 2026-05-19 03:00 UTC
    expect(validateCustomFieldValue("datetime", "2026-05-19T10:00:00", TZ)).toBe(
      "2026-05-19T03:00:00.000Z",
    )
  })

  it("passes an already-offset (Z) datetime through unchanged", () => {
    expect(
      validateCustomFieldValue("datetime", "2026-05-19T10:00:00.000Z", TZ),
    ).toBe("2026-05-19T10:00:00.000Z")
  })

  it("passes an explicit-offset datetime through as its UTC instant", () => {
    // +07:00 wall-clock 10:00 == 03:00 UTC, regardless of the import zone
    expect(
      validateCustomFieldValue("datetime", "2026-05-19T10:00:00+07:00", "UTC"),
    ).toBe("2026-05-19T03:00:00.000Z")
  })

  it("rejects a datetime without a time component", () => {
    expect(validateCustomFieldValue("datetime", "2026-05-19", TZ)).toBeNull()
  })

  it("rejects an unparseable datetime", () => {
    expect(validateCustomFieldValue("datetime", "nonsense", TZ)).toBeNull()
  })
})
```

Then update every **remaining** (non-temporal) call in the file — `text`, `number`, `boolean`, `email`, `phone`, `url`, `single_select`, etc. — to pass `TZ` as the third argument, e.g. `validateCustomFieldValue("number", "42", TZ)`. These branches ignore `timezone`, but the signature is now three-arity so the calls must compile.

- [ ] **Step 2: Run the test — verify it fails (RED)**

Run: `pnpm --filter worker test custom-field-value`
Expected: FAIL — `validateCustomFieldValue` currently takes 2 args and returns naive values (`"date"` → `"2026-05-19"`, server-local `datetime`).

- [ ] **Step 3: Make `validateCustomFieldValue` timezone-aware (GREEN)**

In `apps/worker/src/default/handlers/imports/validations/custom-field-value.ts`, add the engine import and rewrite the two temporal branches to delegate. Keep the existing format gates (they reject malformed cells *before* conversion; the engine only sees well-formed values).

```ts
import {
  filterValueToUtcDayStartIso,
  filterValueToUtcIso,
} from "@chatbotx.io/utils/datetime"

// ...existing DATE_ONLY_RE and other helpers unchanged...

/**
 * A naive calendar date (`YYYY-MM-DD`) is stored as the UTC instant of that
 * day's start *in the importer's zone* — matching the UI/write contract
 * (§ date storage). `timezone` is a resolved IANA zone (never user input).
 */
const normalizeDate = (value: string, timezone: string): string | null => {
  if (!DATE_ONLY_RE.test(value)) {
    return null
  }
  if (Number.isNaN(Date.parse(value))) {
    return null
  }
  return filterValueToUtcDayStartIso(value, timezone)
}

/**
 * A datetime cell is interpreted as a naive wall-clock time in the importer's
 * zone and stored as its UTC instant. Values that already carry an explicit
 * offset (`Z` or `±HH:MM`) pass through the engine unchanged.
 */
const normalizeDateTime = (value: string, timezone: string): string | null => {
  if (!value.includes("T")) {
    return null
  }
  if (Number.isNaN(Date.parse(value))) {
    return null
  }
  return filterValueToUtcIso(value, timezone)
}

export const validateCustomFieldValue = (
  type: CustomFieldType,
  raw: string,
  timezone: string,
): string | null => {
  // ...existing empty-guard and non-temporal branches unchanged...
  switch (type) {
    // ...text / number / boolean / email / phone / url / select branches unchanged...
    case "date":
      return normalizeDate(raw, timezone)
    case "datetime":
      return normalizeDateTime(raw, timezone)
    default:
      return raw
  }
}
```

> **Scope note:** the `datetime` gate still requires a `T` separator, so space-separated cells (`"2026-05-19 10:00"`) remain rejected exactly as today. Broadening accepted CSV formats is out of scope for this timezone change.

- [ ] **Step 4: Run the test — verify it passes (GREEN)**

Run: `pnpm --filter worker test custom-field-value`
Expected: PASS.

- [ ] **Step 5: Add the optional `timezone` to the request + meta schemas**

In `apps/builder/src/features/contacts/schemas/contact-import.ts`, add to the `importContactsRequest` object (before the closing `})` / `.superRefine(...)`):

```ts
  timezone: z.string().max(64).optional(),
```

In `packages/database/src/partials/import.ts`, add to `contactImportMetaSchema`:

```ts
  /**
   * IANA timezone of the importer's browser, used by the worker to interpret
   * naive date/datetime CSV cells. Absent for token-API imports (no browser),
   * where the handler falls back to the workspace timezone.
   */
  timezone: z.string().optional(),
```

Run: `pnpm --filter builder check-types && pnpm --filter @chatbotx.io/database check-types`
Expected: no errors (the field is optional; existing callers still compile).

- [ ] **Step 6: Capture the browser timezone in the import form**

In `apps/builder/src/features/contacts/import-contact-form.tsx`:

Add the import:

```ts
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"
```

Add `timezone: ""` to `defaultValues`, then set it once on mount (mirror the existing `fileId` effect):

```tsx
// Capture the importer's browser timezone so the worker can store naive
// date/datetime CSV cells as UTC. Filters already use this same helper.
useEffect(() => {
  form.setValue("timezone", getBrowserTimezone())
}, [form.setValue])
```

Run: `pnpm --filter builder check-types`
Expected: no errors.

- [ ] **Step 7: Thread `timezone` into both meta-builders**

In `apps/builder/src/features/contacts/actions/import-contacts.action.ts`, add to the `meta` object literal:

```ts
    timezone: parsedInput.timezone,
```

In `apps/builder/src/features/contacts/contact-import.service.ts`, add to its `meta` object literal:

```ts
    timezone: input.timezone,
```

Run: `pnpm --filter builder check-types`
Expected: no errors.

- [ ] **Step 8: Resolve `importTimezone` in the worker handler and thread it into `ContactDeps`**

In `apps/worker/src/default/handlers/imports/handler/contacts/handler.ts`:

Add the engine import:

```ts
import { resolveFilterTimezone } from "@chatbotx.io/utils/datetime"
```

Extend the deps type:

```ts
type ContactDeps = {
  customFieldTypes: Map<string, CustomFieldType>
  inbox: typeof inboxModel.$inferSelect
  importTimezone: string
}
```

In `prepareContacts`, after the existing `workspace` null-check, resolve the zone (browser tz when present, else the workspace default — token-API imports have no browser) and include it in the returned deps:

```ts
  const importTimezone = meta.timezone
    ? resolveFilterTimezone(meta.timezone)
    : workspace.timezone

  return { ok: true, deps: { customFieldTypes, inbox, importTimezone } }
```

In `processContactRow`, pass the resolved zone to the normalizer:

```ts
  const normalized = validateCustomFieldValue(type, field.value, deps.importTimezone)
```

The bulk `insert` in `insertContactBatch` is unchanged — by this point every date/datetime value is already a UTC ISO string.

Run: `pnpm --filter worker check-types`
Expected: no errors.

- [ ] **Step 9: Full worker test + lint + invariant check**

Run: `pnpm --filter worker test && pnpm lint`
Expected: PASS / clean.
Then dispatch the `invariant-guard` subagent on the diff (worker + builder + database) to confirm no direct-`db` / binding / i18n regressions and that the `contactImportMetaSchema` change didn't require a migration (it's a JSON meta column — no DDL).

- [ ] **Step 10: Commit**

```bash
git add \
  apps/builder/src/features/contacts/schemas/contact-import.ts \
  packages/database/src/partials/import.ts \
  apps/builder/src/features/contacts/import-contact-form.tsx \
  apps/builder/src/features/contacts/actions/import-contacts.action.ts \
  apps/builder/src/features/contacts/contact-import.service.ts \
  apps/worker/src/default/handlers/imports/validations/custom-field-value.ts \
  apps/worker/src/default/handlers/imports/handler/contacts/handler.ts \
  apps/worker/__tests__/custom-field-value.test.ts
git commit -m "feat(contacts): store imported date/datetime custom fields as UTC using the importer timezone"
```

---

## PHASE 3 — Filter Predicate Timezone Threading (§4.3 / §4.4)

### Task 3.1: Make the datetime custom-field predicate timezone-aware

**Files:**
- Modify: `packages/database/src/queries/contact-filter/custom-field-predicates.ts`
- Modify: `packages/database/src/queries/contact-filter/index.ts:463`
- Test: `packages/database/__tests__/contact-filter.test.ts`

**Interfaces:**
- Consumes: `filterValueToUtcIso`, `filterValueToUtcDayStartIso`, `filterValueToUtcDayEndIso` from `./timezone` (re-export shim).
- Produces: `buildCustomFieldWhere(condition, timezone: string): ContactWhere` (new required 2nd param). `applyContactFilter` already resolves `timezone` once — pass it through.

- [ ] **Step 1: Write the failing test**

Add to `packages/database/__tests__/contact-filter.test.ts` a helper (near `renderFirstRawCondition`) and a `describe` block:

```ts
import { PgDialect } from "drizzle-orm/pg-core"
// (already imported at top: applyContactFilter, operatorTypes, contactModel, SQL)

const renderCustomFieldExists = (where: Record<string, unknown>) => {
  const raw = (where as { AND?: Array<{ RAW?: unknown }> }).AND?.[0]?.RAW
  expect(typeof raw).toBe("function")
  return new PgDialect().sqlToQuery(
    (raw as (table: typeof contactModel) => SQL)(contactModel),
  )
}

describe("datetime custom-field predicate is timezone-aware", () => {
  const VN = "Asia/Ho_Chi_Minh"

  test("eq builds a UTC day range from the filter timezone", () => {
    const where = applyContactFilter({
      operator: "and",
      timezone: VN,
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.eq,
          value: "2026-07-22",
        },
      ],
    })
    const query = renderCustomFieldExists(where)
    // day start / next-midnight in VN, expressed as UTC instants
    expect(query.params).toContain("2026-07-21T17:00:00.000Z")
    expect(query.params).toContain("2026-07-22T17:00:00.000Z")
    expect(query.sql).not.toContain("date_trunc")
  })

  test("gt uses the UTC instant of the wall-clock value", () => {
    const where = applyContactFilter({
      operator: "and",
      timezone: VN,
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.gt,
          value: "2026-07-22 15:30",
        },
      ],
    })
    const query = renderCustomFieldExists(where)
    expect(query.params).toContain("2026-07-22T08:30:00.000Z")
  })

  test("defaults to UTC when no filter timezone is supplied", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.eq,
          value: "2026-07-22",
        },
      ],
    })
    const query = renderCustomFieldExists(where)
    expect(query.params).toContain("2026-07-22T00:00:00.000Z")
    expect(query.params).toContain("2026-07-23T00:00:00.000Z")
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @chatbotx.io/database test contact-filter`
Expected: FAIL — current predicate emits `date_trunc(...)` and ignores timezone; params won't contain the UTC instants.

- [ ] **Step 3: Thread `timezone` through `buildCustomFieldWhere`**

In `custom-field-predicates.ts`, update the imports and the two signatures. Add to the top import block:

```ts
import {
  filterValueToUtcDayEndIso,
  filterValueToUtcDayStartIso,
  filterValueToUtcIso,
} from "./timezone"
```

Change `buildCustomFieldWhere` (line 23) to accept `timezone` and pass it down:

```ts
export function buildCustomFieldWhere(
  condition: {
    customFieldId?: string
    operator: string
    value?: unknown
    valueType?: string
  },
  timezone: string,
): ContactWhere {
  if (!condition.customFieldId) {
    return {}
  }
  const comparison = buildCustomFieldComparison(
    condition.operator,
    condition.value,
    condition.valueType,
    timezone,
  )
  if (!comparison) {
    return {}
  }

  return existsWhere(
    (contactId) =>
      sql`SELECT 1 FROM ${contactCustomFieldModel} WHERE ${contactCustomFieldModel.contactId} = ${contactId} AND ${contactCustomFieldModel.customFieldId} = ${condition.customFieldId} AND ${comparison.predicate}`,
    comparison.negate,
  )
}
```

Thread `timezone` through `buildCustomFieldComparison` and `buildCustomFieldPositivePredicate`:

```ts
function buildCustomFieldComparison(
  operator: string,
  value: unknown,
  valueType: string | undefined,
  timezone: string,
): CustomFieldComparison | undefined {
  const positiveOperator = NEGATION_TO_POSITIVE[operator as OperatorType]
  const negate = positiveOperator !== undefined
  const predicate = buildCustomFieldPositivePredicate(
    positiveOperator ?? operator,
    value,
    valueType,
    timezone,
  )
  return predicate ? { predicate, negate } : undefined
}

function buildCustomFieldPositivePredicate(
  operator: string,
  value: unknown,
  valueType: string | undefined,
  timezone: string,
): SQL | undefined {
  if (operator === operatorTypes.enum.isNotEmpty) {
    const column = contactCustomFieldModel.value
    return sql`(${column} IS NOT NULL AND ${column} <> '')`
  }

  const intervalValue = getCustomFieldIntervalValue(value)
  if (valueType === "number") {
    return buildNumberCustomFieldPredicate(operator, value, intervalValue)
  }
  if (valueType === "datetime") {
    return buildDatetimeCustomFieldPredicate(operator, value, intervalValue, timezone)
  }
  return buildTextCustomFieldPredicate(operator, value)
}
```

- [ ] **Step 4: Rewrite `buildDatetimeCustomFieldPredicate` to mirror `buildDateColumnWhere`**

Replace the whole function (lines 153-200). The `value` column is TEXT holding UTC-ISO instants; compare it as `timestamptz` against UTC-instant literals computed in JS from the filter timezone — no `date_trunc`, DST-safe day ranges:

```ts
function buildDatetimeCustomFieldPredicate(
  operator: string,
  value: unknown,
  intervalValue: IntervalValue | undefined,
  timezone: string,
): SQL | undefined {
  const column = contactCustomFieldModel.value
  const guard = sql`(${column} IS NOT NULL AND ${column} <> '' AND ${column} ~ ${DATETIME_VALUE_PATTERN})`
  const ts = sql`CASE WHEN ${guard} THEN NULLIF(${column}, '')::timestamptz END`

  if (operator === operatorTypes.enum.isBetween) {
    if (
      !(
        intervalValue &&
        isValidDateTimeFilterValue(intervalValue[0]) &&
        isValidDateTimeFilterValue(intervalValue[1])
      )
    ) {
      return
    }
    const startUtc = filterValueToUtcIso(intervalValue[0], timezone)
    const endUtc = filterValueToUtcIso(intervalValue[1], timezone)
    return sql`(${guard} AND ${ts} >= ${startUtc}::timestamptz AND ${ts} <= ${endUtc}::timestamptz)`
  }

  if (
    typeof value !== "string" ||
    value === "" ||
    !isValidDateTimeFilterValue(value)
  ) {
    return
  }

  if (operator === operatorTypes.enum.eq) {
    const dayStart = filterValueToUtcDayStartIso(value, timezone)
    const dayEnd = filterValueToUtcDayEndIso(value, timezone)
    return sql`(${guard} AND ${ts} >= ${dayStart}::timestamptz AND ${ts} < ${dayEnd}::timestamptz)`
  }

  const instant = filterValueToUtcIso(value, timezone)
  switch (operator) {
    case operatorTypes.enum.gt:
      return sql`(${guard} AND ${ts} > ${instant}::timestamptz)`
    case operatorTypes.enum.gte:
      return sql`(${guard} AND ${ts} >= ${instant}::timestamptz)`
    case operatorTypes.enum.lt:
      return sql`(${guard} AND ${ts} < ${instant}::timestamptz)`
    case operatorTypes.enum.lte:
      return sql`(${guard} AND ${ts} <= ${instant}::timestamptz)`
    default:
      return
  }
}
```

> `ne` is handled by the `NEGATION_TO_POSITIVE` map: it maps to `eq` + `negate`, so the `eq` day-range branch above serves both. No `ne` case is needed here.

- [ ] **Step 5: Pass `timezone` at the call site**

In `packages/database/src/queries/contact-filter/index.ts`, line 463-464, change:

```ts
    case "customField":
      return buildCustomFieldWhere(condition, timezone)
```

`timezone` is already resolved once at the top of the builder and in scope here (the same variable threaded into `buildDateColumnWhere`). If the local variable has a different name in that scope, use it verbatim.

- [ ] **Step 6: Run the test — expect pass**

Run: `pnpm --filter @chatbotx.io/database test contact-filter`
Expected: PASS (new datetime custom-field cases + all pre-existing cases).

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @chatbotx.io/database check-types`
Expected: no errors.

```bash
git add packages/database/src/queries/contact-filter/custom-field-predicates.ts packages/database/src/queries/contact-filter/index.ts packages/database/__tests__/contact-filter.test.ts
git commit -m "feat(contact-filter): make datetime custom-field predicate timezone-aware"
```

---

### Task 3.2: Audit filter-surface timezone persistence (§4.4)

**Files:** read-only audit; fix only if a gap is found.

- [ ] **Step 1: Confirm all five surfaces persist `timezone`**

Run:
```bash
grep -rn "getBrowserTimezone\|timezone" \
  apps/builder/src/features/contact-filter/components/contact-filter.tsx \
  apps/builder/src/features/contact-filter/components/contact-list-filter.tsx \
  apps/builder/src/features/contact-filter/schemas/index.ts
```
Expected: the shared `<ContactFilter>` / `<ContactListFilter>` components stamp `getBrowserTimezone()` into `contactFilterCriteriaSchema.timezone` (Phase 1). Broadcast, contact-filter, inbox, and chat-store reuse these components → covered.

- [ ] **Step 2: Confirm persisted (server-stored) filters replay their timezone**

Trigger conditions and webhook filter configs store the criteria server-side and re-evaluate later. Verify the stored config includes `timezone` and that the evaluator passes it into `applyContactFilter` / `matchesContactFilter`:
```bash
grep -rn "timezone" \
  apps/builder/src/features/*/schema* \
  apps/worker/src/trigger/services/condition-evaluator.ts \
  apps/worker/src/trigger/services/datetime-trigger-evaluator.ts
```
Expected: `ConditionCaseSchema` / `ContactFilterCriteria` already carry `timezone` (memory: trigger condition steps have a `timezone` field). If any evaluator drops it before calling the filter builder, thread it through. If all pass it, **no code change** — record "audit clean" in the commit message of the next task.

- [ ] **Step 3: If a gap was found, fix + test; otherwise skip**

Any fix mirrors Task 3.1's threading (pass the stored `timezone` into the filter builder). Add an evaluator-level test asserting the stored timezone reaches the predicate. Commit separately:
```bash
git commit -m "fix(trigger): replay stored filter timezone in condition evaluation"
```

---

## PHASE 4 — Variable Rendering in Workspace Timezone (§4.5)

### Task 4.1: Type-aware custom-field variable substitution

**Files:**
- Modify: `packages/variables/src/utils.ts`
- Modify: `packages/variables/src/contact-variable.ts:135-138`
- Test: `packages/variables/__tests__/render-custom-field-value.test.ts`

**Interfaces:**
- Produces (from `utils.ts`): `renderCustomFieldValue(input: { type: CustomFieldType; value: string | null | undefined; context: ContactVariableContext }): string`.
- Consumes: `formatCustomFieldValueInTimeZone` from `@chatbotx.io/utils/datetime` (the shared formatter — Phase 0); `getTimezone` (workspace-first) in `utils.ts`. `renderCustomFieldValue` is now a thin wrapper: resolve the workspace-first zone, then delegate. It no longer hand-rolls `safeFormatInTimeZone`/`DATE_PATTERN`/`DATE_TIME_PATTERN` (those stay in `utils.ts` for the system-field formatters).

> **Dependency check:** confirm `packages/variables/package.json` lists `@chatbotx.io/utils` in `dependencies`. If absent, add `"@chatbotx.io/utils": "workspace:*"` and run `CI=true pnpm install --no-frozen-lockfile`. (`variables` already imports `@chatbotx.io/database/partials`, so it is a workspace consumer; adding utils introduces no cycle — utils has no workspace deps.)

- [ ] **Step 1: Write the failing test**

Create `packages/variables/__tests__/render-custom-field-value.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import { renderCustomFieldValue } from "../src/utils"

const context = (timezone: string) =>
  ({
    contact: { timezone: null },
    contactInbox: null,
    conversation: null,
    workspace: { timezone },
  }) as never

describe("renderCustomFieldValue", () => {
  test("datetime renders in the workspace timezone", () => {
    expect(
      renderCustomFieldValue({
        type: "datetime",
        value: "2026-07-22T08:30:00.000Z",
        context: context("Asia/Ho_Chi_Minh"),
      }),
    ).toBe("2026-07-22 15:30:00")
  })

  test("date renders the calendar day in the workspace timezone", () => {
    expect(
      renderCustomFieldValue({
        type: "date",
        value: "2026-07-21T17:00:00.000Z",
        context: context("Asia/Ho_Chi_Minh"),
      }),
    ).toBe("2026-07-22")
  })

  test("non-temporal types stringify verbatim", () => {
    expect(
      renderCustomFieldValue({ type: "shortText", value: "hello", context: context("UTC") }),
    ).toBe("hello")
  })

  test("empty / null values render as empty string", () => {
    expect(renderCustomFieldValue({ type: "date", value: null, context: context("UTC") })).toBe("")
    expect(renderCustomFieldValue({ type: "datetime", value: "", context: context("UTC") })).toBe("")
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @chatbotx.io/variables test render-custom-field-value`
Expected: FAIL — `renderCustomFieldValue` not exported.

- [ ] **Step 3: Export `renderCustomFieldValue` from `utils.ts`**

Add `CustomFieldType` to the existing partials import:

```ts
import {
  type ContactSource,
  contactSources,
  type CustomFieldType,
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
```

Import the shared formatter at the top of `utils.ts` (keep import groups sorted):

```ts
import { formatCustomFieldValueInTimeZone } from "@chatbotx.io/utils/datetime"
```

Add the exported function (place it after `formatDateTime`). It is a thin wrapper — the workspace-first zone comes from the existing `getTimezone`, and all format/guard logic lives once in the shared engine:

```ts
/**
 * Render a custom-field value for variable substitution. Temporal fields are
 * formatted in the WORKSPACE timezone (workspace-first via `getTimezone`);
 * everything else stringifies verbatim. Delegates to the one shared read-surface
 * formatter so variable output, CSV export, and the contact panel never drift.
 */
export const renderCustomFieldValue = ({
  type,
  value,
  context,
}: {
  type: CustomFieldType
  value: string | null | undefined
  context: ContactVariableContext
}): string =>
  formatCustomFieldValueInTimeZone(type, value, getTimezone(context))
```

> The prior draft inlined a `switch` over `safeFormatInTimeZone`/`DATE_PATTERN`/`DATE_TIME_PATTERN`. That logic now lives in `@chatbotx.io/utils/datetime`; leave those helpers in `utils.ts` (the system-field formatters still use them) but do not reference them from `renderCustomFieldValue`. The Phase 0 `DISPLAY_*` patterns equal the values these tests assert (`"yyyy-MM-dd"`, `"yyyy-MM-dd HH:mm:ss"`), so the assertions below stay green.

- [ ] **Step 4: Use it in `contact-variable.ts`**

Update the import from `./utils` (line 15):

```ts
import {
  extractVariables,
  getSystemFieldValue,
  interpolate,
  renderCustomFieldValue,
} from "./utils"
```

Replace the custom-field branch (lines 135-138):

```ts
        } else if (customFieldsMap.has(variable)) {
          const field = customFieldsMap.get(variable)
          mapping[variable] = field
            ? renderCustomFieldValue({
                type: field.type,
                value: field.value,
                context: props.variables,
              })
            : ""
        }
```

`props.variables` is the `ReplaceVariableProps` context (the same value passed to `getSystemFieldValue` above), so it satisfies `ContactVariableContext`. The map entry already carries `{ key, type, value, description }`.

- [ ] **Step 5: Run the test — expect pass**

Run: `pnpm --filter @chatbotx.io/variables test render-custom-field-value`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @chatbotx.io/variables check-types`
Expected: no errors.

```bash
git add packages/variables/src/utils.ts packages/variables/src/contact-variable.ts packages/variables/__tests__/render-custom-field-value.test.ts
git commit -m "feat(variables): render date/datetime custom fields in workspace timezone"
```

---

## PHASE 4B — Read Surfaces (§4.5b)

Backfilling to UTC ISO means every place that *reads a stored value back* now sees `2026-07-22T08:30:00.000Z` instead of `2026-07-22 15:30`. Three surfaces read date/datetime custom-field values; each has a locked contract (see Global Constraints → *Read-surface contract*). This phase makes each surface honor it.

### Task 4B.1: Lock the public API to canonical UTC ISO (regression test)

**Files:**
- Create: `apps/builder/__tests__/list-contact-fields-iso.test.ts`

**Interfaces:**
- Consumes: `listContactCustomFields` from `apps/builder/src/features/contacts/queries/list-contact-fields.query.ts` (unchanged — it already returns `value: d.value` verbatim).
- Produces: nothing. This is a **contract lock** — the public API (`listContactFieldsAuthenticatedAPI`, `listContactCustomFieldsWorkspaceTokenAPI`) must keep returning the raw UTC ISO so API consumers receive an unambiguous absolute instant. No formatter is added.

- [ ] **Step 1: Write the regression test**

Create `apps/builder/__tests__/list-contact-fields-iso.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest"

const ISO_DATETIME = "2026-07-22T08:30:00.000Z"
const ISO_DATE = "2026-07-21T17:00:00.000Z"

// Mock the DB client so the query resolves without a live database.
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactCustomFieldModel: {
        findMany: () =>
          Promise.resolve([
            {
              value: ISO_DATETIME,
              customField: {
                id: "cf1",
                name: "Appointment",
                type: "datetime",
                workspaceId: "w1",
              },
            },
            {
              value: ISO_DATE,
              customField: {
                id: "cf2",
                name: "Birthday",
                type: "date",
                workspaceId: "w1",
              },
            },
          ]),
      },
    },
  },
}))
// The query type-imports from these; stub so importing the module is cheap.
vi.mock("@chatbotx.io/business", () => ({ contactService: {} }))
vi.mock("@chatbotx.io/business/errors", () => ({ notFoundException: () => new Error("not found") }))

const { listContactCustomFields } = await import(
  "../src/features/contacts/queries/list-contact-fields.query"
)

describe("listContactCustomFields returns canonical UTC ISO verbatim", () => {
  test("does not reformat stored datetime/date values (API contract)", async () => {
    const result = await listContactCustomFields({
      workspaceId: "w1",
      contactId: "c1",
    })
    const byId = Object.fromEntries(result.data.map((d) => [d.id, d.value]))
    expect(byId.cf1).toBe(ISO_DATETIME)
    expect(byId.cf2).toBe(ISO_DATE)
  })
})
```

- [ ] **Step 2: Run — expect pass immediately (no production change)**

Run: `pnpm --filter builder test list-contact-fields-iso`
Expected: PASS. If it fails because a formatter was mistakenly added to the query, remove that formatter — the API contract is raw ISO.

- [ ] **Step 3: Commit**

```bash
git add apps/builder/__tests__/list-contact-fields-iso.test.ts
git commit -m "test(contacts): lock public custom-field API to canonical UTC ISO"
```

---

### Task 4B.2: CSV export renders in the workspace timezone

**Files:**
- Modify: `apps/worker/src/default/handlers/export-contacts.ts`
- Test: `apps/worker/__tests__/export-contacts-datetime.test.ts`

**Interfaces:**
- Consumes: `formatCustomFieldValueInTimeZone`, `resolveFilterTimezone` from `@chatbotx.io/utils/datetime`; `normalizeStoredTimezone` from `@chatbotx.io/business/contact-locale`.
- Produces: `SelectedField` (custom variant) gains `customFieldType: string`; `renderCell(contact, field, timezone)` and `buildCsvChunk(contacts, selectedFields, timezone)` gain a trailing `timezone: string` param.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/__tests__/export-contacts-datetime.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import { buildCsvChunk } from "../src/default/handlers/export-contacts"

const VN = "Asia/Ho_Chi_Minh"

describe("CSV export formats temporal custom fields in the workspace timezone", () => {
  test("datetime: stored UTC instant → workspace wall-clock", () => {
    const contacts = [
      { contactCustomFields: [{ customFieldId: "cf1", value: "2026-07-22T08:30:00.000Z" }] },
    ]
    const fields = [
      { type: "custom" as const, value: "cf1", header: "Appointment", customFieldType: "datetime" },
    ]
    expect(buildCsvChunk(contacts as never, fields, VN)).toBe('"2026-07-22 15:30:00"\n')
  })

  test("date: stored UTC start-of-day → workspace calendar day", () => {
    const contacts = [
      { contactCustomFields: [{ customFieldId: "cf2", value: "2026-07-21T17:00:00.000Z" }] },
    ]
    const fields = [
      { type: "custom" as const, value: "cf2", header: "Birthday", customFieldType: "date" },
    ]
    expect(buildCsvChunk(contacts as never, fields, VN)).toBe('"2026-07-22"\n')
  })

  test("non-temporal custom field is unaffected", () => {
    const contacts = [
      { contactCustomFields: [{ customFieldId: "cf3", value: "hello" }] },
    ]
    const fields = [
      { type: "custom" as const, value: "cf3", header: "Note", customFieldType: "shortText" },
    ]
    expect(buildCsvChunk(contacts as never, fields, VN)).toBe('"hello"\n')
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter worker test export-contacts-datetime`
Expected: FAIL — `buildCsvChunk` currently takes 2 args and renders the raw ISO; `customFieldType` is not on `SelectedField`.

- [ ] **Step 3: Add the imports**

At the top of `export-contacts.ts` (with the other imports):

```ts
import { normalizeStoredTimezone } from "@chatbotx.io/business/contact-locale"
import {
  formatCustomFieldValueInTimeZone,
  resolveFilterTimezone,
} from "@chatbotx.io/utils/datetime"
```

- [ ] **Step 4: Extend the `custom` `SelectedField` variant** (line 46-49)

```ts
export type SelectedField =
  | { type: "contact"; value: string; header: string }
  | { type: "custom"; value: string; header: string; customFieldType: string }
  | { type: "tag"; value: string; header: string }
```

- [ ] **Step 5: Format the custom cell in `renderCell`** (thread `timezone`, line 80-107)

Change the signature and the `custom` branch:

```ts
const renderCell = (
  contact: ContactRow,
  field: SelectedField,
  timezone: string,
): string => {
  // ... "contact" branch unchanged ...

  if (field.type === "custom") {
    const customField = contact.contactCustomFields?.find(
      (cf) => cf.customFieldId === field.value,
    )
    const formatted = formatCustomFieldValueInTimeZone(
      field.customFieldType,
      customField?.value,
      timezone,
    )
    return formatted ? escapeCsvValue(formatted) : '""'
  }

  // ... "tag" branch unchanged ...
}
```

- [ ] **Step 6: Thread `timezone` through `buildCsvChunk`** (line 110-118)

```ts
export const buildCsvChunk = (
  contacts: ContactRow[],
  selectedFields: SelectedField[],
  timezone: string,
): string => {
  const lines = contacts.map((contact) =>
    selectedFields.map((field) => renderCell(contact, field, timezone)).join(","),
  )
  return lines.length > 0 ? `${lines.join("\n")}\n` : ""
}
```

- [ ] **Step 7: Capture the custom-field `type` in `buildSelectedFields`** (line 228-268)

Add a metadata loader beside `loadNameMap` (the existing `customFieldModel.findMany` already returns `type`):

```ts
/** Loads name + type for custom fields, keyed by id. */
const loadCustomFieldMeta = async (
  ids: string[],
  workspaceId: string,
): Promise<Record<string, { name: string; type: string }>> => {
  if (ids.length === 0) {
    return {}
  }
  const rows = await db.query.customFieldModel.findMany({
    where: { id: { in: ids }, workspaceId },
    columns: { id: true, name: true, type: true },
  })
  return Object.fromEntries(
    rows.map((row) => [row.id, { name: row.name, type: row.type }]),
  )
}
```

Replace the custom-field branch of the `Promise.all` and the `.map` result. Swap the custom `loadNameMap(...)` call for `loadCustomFieldMeta(idsOfType("custom"), workspaceId)`:

```ts
  const [tagNameById, customFieldMetaById] = await Promise.all([
    loadNameMap(idsOfType("tag"), (ids) =>
      db.query.tagModel.findMany({
        where: {
          id: { in: ids },
          workspaceId,
          deletedAt: { isNull: true as const },
        },
      }),
    ),
    loadCustomFieldMeta(idsOfType("custom"), workspaceId),
  ])
```

And the custom branch of the final `.map`:

```ts
    if (field.type === "custom") {
      const meta = customFieldMetaById[field.value]
      return {
        type: "custom",
        value: field.value,
        header: meta?.name ?? field.value,
        customFieldType: meta?.type ?? "",
      }
    }
```

- [ ] **Step 8: Load the workspace timezone once and thread it into `buildCsvChunk`**

Find the handler's call to `buildCsvChunk`:

Run: `grep -n "buildCsvChunk\|buildSelectedFields\|export const handleExportContacts\|workspaceModel" apps/worker/src/default/handlers/export-contacts.ts`

In the main handler (the exported function that streams the CSV), resolve the workspace timezone once — before the contact page loop — and pass it to every `buildCsvChunk` call:

```ts
  const workspace = await db.query.workspaceModel.findFirst({
    where: { id: data.workspaceId },
    columns: { timezone: true },
  })
  const workspaceTimezone = resolveFilterTimezone(
    normalizeStoredTimezone(workspace?.timezone ?? null),
  )
  // ... then per page:
  //   const chunk = buildCsvChunk(contacts, selectedFields, workspaceTimezone)
```

Update each `buildCsvChunk(contacts, selectedFields)` call site to pass `workspaceTimezone`.

- [ ] **Step 9: Fix any other in-repo callers of the changed signatures**

Run: `grep -rn "buildCsvChunk\|renderCell\|SelectedField" apps/worker --include='*.ts' | grep -v "export-contacts.ts"`
Any other caller (or existing test) of `buildCsvChunk` / a `custom` `SelectedField` literal must add the `timezone` arg / `customFieldType` field. Update them.

- [ ] **Step 10: Run the tests — expect pass**

Run: `pnpm --filter worker test export-contacts`
Expected: PASS (new datetime test + all pre-existing export-contacts tests).

- [ ] **Step 11: Typecheck + commit**

Run: `pnpm --filter worker check-types`
Expected: no errors.

```bash
git add apps/worker/src/default/handlers/export-contacts.ts apps/worker/__tests__/export-contacts-datetime.test.ts
git commit -m "feat(export): render date/datetime custom fields in the workspace timezone"
```

---

### Task 4B.3: Contact-detail displays browser-local and round-trips the edit picker

**Files:**
- Modify: `apps/builder/src/features/contacts/contact-detail.tsx`
- Modify: `packages/ui/src/components/form/date-picker-field.tsx`
- Modify: `apps/builder/src/features/bot-fields/account-field-value-input.tsx`
- Modify: `apps/builder/src/features/contacts/edit-contact-field.tsx`

**Interfaces:**
- Consumes: `formatCustomFieldValueInTimeZone` from `@chatbotx.io/utils/datetime`; `getBrowserTimezone` from `../contact-filter/lib/timezone` (the exact helper the filter components use to stamp `criteria.timezone`).
- Produces: contact-detail custom-field entries carry a browser-local `value` (display) and the raw UTC ISO in `formValue`; the edit picker emits/consumes ISO via `saveFormat="iso"`.

**Why these four files move together:** the panel shows `editable.value` (must be browser-local text) but its inline editor feeds `formValue ?? value` into the picker (must be a parseable ISO). `DateTimePickerField` already parses/emits ISO when `saveFormat="iso"`; `DatePickerField` currently accepts the prop through the shared type but ignores it at runtime and still calls `parse(value, "yyyy-MM-dd")`. So display formatting, runtime date-picker ISO support, and the `saveFormat="iso"` plumbing must land in the same commit or the editor breaks for `date` fields.

- [ ] **Step 1: Make `DatePickerField` honor `saveFormat="iso"`**

In `packages/ui/src/components/form/date-picker-field.tsx`, mirror the runtime behavior that `DateTimePickerField` already has. The prop is already present in `DateTimePickerFieldProps`; the missing piece is destructuring it and using it in `getDateValue` / `handleChange`:

```tsx
export function DatePickerField<T extends FieldValues>(
  props: Omit<
    DateTimePickerFieldProps<T>,
    "locale" | "weekStartsOn" | "showWeekNumber" | "showOutsideDays"
  >,
) {
  const {
    label,
    name,
    required,
    description,
    descriptionType = "inline",
    formItemClassName,
    dateTimeFormat = "yyyy-MM-dd",
    saveFormat = "formatted",
    ...rest
  } = props

  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      formItemClassName={formItemClassName}
      label={label}
      name={name}
      required={required}
    >
      {(field) => {
        const getDateValue = (): Date | undefined => {
          if (!field.value) {
            return
          }
          try {
            if (saveFormat === "iso") {
              const parsed = new Date(field.value as string)
              return Number.isNaN(parsed.getTime()) ? undefined : parsed
            }
            return parse(field.value as string, dateTimeFormat, new Date())
          } catch {
            return
          }
        }

        const handleChange = (value: Date | undefined) => {
          if (!value) {
            field.onChange(undefined as T[FieldPath<T>])
            return
          }
          const saved =
            saveFormat === "iso"
              ? value.toISOString()
              : format(value, dateTimeFormat)
          field.onChange(saved as T[FieldPath<T>])
        }

        return (
          <DateTimePicker
            displayFormat={{ hour24: dateTimeFormat }}
            granularity="day"
            {...rest}
            onChange={handleChange}
            value={getDateValue()}
          />
        )
      }}
    </FormFieldWrapper>
  )
}
```

- [ ] **Step 2: Add the `saveFormat` prop to `BotFieldValueInput`**

In `apps/builder/src/features/bot-fields/account-field-value-input.tsx`, extend the props and forward the flag to the two temporal pickers (default keeps existing callers — e.g. `create-bot-field-dialog.tsx` — unchanged):

```tsx
type BotFieldValueInputProps = {
  name?: string
  type: CustomFieldType
  saveFormat?: "formatted" | "iso"
}

export const BotFieldValueInput = ({
  name = "value",
  type,
  saveFormat = "formatted",
}: BotFieldValueInputProps) => {
  const t = useTranslations()

  switch (type) {
    // ... number / boolean unchanged ...
    case "date": {
      return <DatePickerField name={name} saveFormat={saveFormat} />
    }
    case "datetime": {
      const dateTimeFormat = "yyyy-MM-dd HH:mm"
      return (
        <DateTimePickerField
          dateTimeFormat={dateTimeFormat}
          name={name}
          saveFormat={saveFormat}
        />
      )
    }
    // ... longText / default unchanged ...
  }
}
```

- [ ] **Step 3: Pass `saveFormat="iso"` from the contact-detail editor**

In `apps/builder/src/features/contacts/edit-contact-field.tsx`, the `<BotFieldValueInput>` (imported as `BotFieldValueInput`) currently renders:

```tsx
<BotFieldValueInput
  name={targetField?.key ?? ""}
  type={targetField?.type ?? "shortText"}
/>
```

Add `saveFormat="iso"`:

```tsx
<BotFieldValueInput
  name={targetField?.key ?? ""}
  saveFormat="iso"
  type={targetField?.type ?? "shortText"}
/>
```

`saveFormat` is a no-op for non-temporal input types, so passing it unconditionally is safe — only the `date`/`datetime` pickers consume it.

- [ ] **Step 4: Format contact-detail display in the browser timezone**

In `apps/builder/src/features/contacts/contact-detail.tsx`:

Add imports:

```ts
import { formatCustomFieldValueInTimeZone } from "@chatbotx.io/utils/datetime"
import { getBrowserTimezone } from "../contact-filter/lib/timezone"
```

Add a display helper directly after `getContactFieldDisplayValue` (line 137). It formats temporal custom fields in the browser zone and defers to the existing system-field formatter for everything else:

```ts
  const toDisplayValue = (
    field: { key: string; type?: CustomFieldType },
    rawValue: string,
  ): string => {
    if (field.type === "date" || field.type === "datetime") {
      return formatCustomFieldValueInTimeZone(
        field.type,
        rawValue,
        getBrowserTimezone(),
      )
    }
    return getContactFieldDisplayValue(field.key, rawValue)
  }
```

- [ ] **Step 5: Set browser-local `value` + raw-ISO `formValue` at the load site** (line 264-277)

```tsx
        for (const contactCustomField of contact?.customFields ?? []) {
          const targetCustomField = customFieldMap.get(contactCustomField.id)
          if (targetCustomField) {
            const type = targetCustomField.type as CustomFieldType
            tmpContactFields.push({
              key: contactCustomField.id,
              icon: customFieldIconsMap[type],
              label: targetCustomField.name,
              value: toDisplayValue(
                { key: contactCustomField.id, type },
                contactCustomField.value,
              ),
              formValue: contactCustomField.value,
              type,
            })
          }
        }
```

- [ ] **Step 6: Reformat on edit** (`handleCustomFieldUpdated`, line 145-157)

The picker now emits ISO; keep it in `formValue`, and derive the browser-local display from the field's own type:

```ts
  const handleCustomFieldUpdated = (fieldKey: string, value: string) => {
    setContactFields((previous) =>
      previous.map((field) =>
        field.key === fieldKey
          ? {
              ...field,
              formValue: value,
              value: toDisplayValue(field, value),
            }
          : field,
      ),
    )
  }
```

`ContactEditableField` already carries `formValue?: string` (the editor reads `targetField.formValue ?? targetField.value`), so no type change is needed. `handleChooseCustomField` pushes a brand-new field with `value: ""` and no `formValue` — the empty value renders empty and the picker opens blank, which is correct; leave it as is.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm --filter @chatbotx.io/ui check-types && pnpm --filter builder check-types && pnpm lint`
Expected: clean.

- [ ] **Step 8: Manual round-trip verification (documented, no auto-run)**

In `pnpm --filter builder dev` with a `+07:00` browser and a contact whose stored `datetime` value is `2026-07-22T08:30:00.000Z`:
- The panel row shows `2026-07-22 15:30:00` (browser-local).
- Clicking it opens the picker at `2026-07-22 15:30` (browser-local).
- Changing to `16:00` and saving sends `2026-07-22T09:00:00.000Z` (ISO) in the network payload, and the row re-renders `2026-07-22 16:00:00`.
- Repeat with a `date` field whose stored value is `2026-07-21T17:00:00.000Z`; the row shows `2026-07-22`, the picker opens on `2026-07-22`, and saving sends an ISO string instead of `yyyy-MM-dd`.
Record the observed payload in the commit body.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/components/form/date-picker-field.tsx apps/builder/src/features/contacts/contact-detail.tsx apps/builder/src/features/bot-fields/account-field-value-input.tsx apps/builder/src/features/contacts/edit-contact-field.tsx
git commit -m "feat(contacts): display date/datetime custom fields browser-local with ISO edit round-trip"
```

---

## PHASE 5 — UI Pickers Emit UTC ISO (§4.6)

### Task 5.1: Save custom-field pickers as ISO

**Files:**
- Modify: `apps/builder/src/features/contacts/components/add-custom-field-dialog.tsx:189-200`

**Background:** `DateTimePickerField` already supports `saveFormat="iso"`. With it, `handleChange` emits `value.toISOString()` from a browser-local `Date` — selecting `2026-07-22 15:30` at `+07:00` yields `2026-07-22T08:30:00.000Z`; selecting date `2026-07-22` (`granularity="day"`, local midnight) yields `2026-07-21T17:00:00.000Z`. Read-back parses the ISO and displays browser-local. The write normalizer's `hasExplicitOffset` guard passes these through unchanged — no double conversion.

- [ ] **Step 1: Add `saveFormat="iso"` to both pickers**

```tsx
        {selectedCustomFieldType === "date" && (
          <DateTimePickerField
            dateTimeFormat="yyyy-MM-dd"
            granularity="day"
            name={getFieldName("value")}
            required
            saveFormat="iso"
          />
        )}

        {selectedCustomFieldType === "datetime" && (
          <DateTimePickerField
            name={getFieldName("value")}
            required
            saveFormat="iso"
          />
        )}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter builder check-types`
Expected: no errors (the prop already exists on `DateTimePickerField`).

- [ ] **Step 3: Manual round-trip verification (documented, no auto-run)**

In `pnpm --filter builder dev`, add a `date` and a `datetime` custom-field value in a `+07:00` browser. Confirm:
- Network payload sends the UTC ISO (`...Z`) value.
- Reopening the contact shows the same browser-local wall-clock.
Record the observed request payload in the commit body.

- [ ] **Step 4: Commit**

```bash
git add apps/builder/src/features/contacts/components/add-custom-field-dialog.tsx
git commit -m "feat(contacts): save date/datetime custom fields as UTC ISO from pickers"
```

> **Audit note:** grep for other `DateTimePickerField` usages that write `date`/`datetime` custom-field values (`grep -rn "DateTimePickerField" apps/builder/src/features/contacts apps/builder/src/features/contact-filter`). Filter inputs stay naive-wall-clock (they pair with `criteria.timezone`) and must NOT get `saveFormat="iso"`. Only *value-entry* pickers for custom fields change.

---

## PHASE 6 — Worker `formatDate` Reads Timezone-Aware (§4.7)

### Task 6.1: Reformat stored UTC values in the correct timezone

**Files:**
- Modify: `apps/builder/src/features/flows/react-flow/steps/format-date/editor.tsx` (output field selector)
- Modify: `apps/worker/src/integration/handlers/tool-handler.ts` (formatDate step, site 3b)
- Test: `apps/worker/__tests__/format-date-handler.test.ts`

**Interfaces:**
- Consumes: `formatInTimeZone` from `date-fns-tz`; `normalizeStoredTimezone` from `@chatbotx.io/business/contact-locale`; `resolveFilterTimezone` from `@chatbotx.io/utils/datetime`; `contactCustomFieldService.setValues(...)` from `@chatbotx.io/business`.
- Produces: the `formatDate` step always stores its formatted output as text, never as a `date`/`datetime` custom-field value.

**Background:** the formatDate step reads a stored custom-field value and reformats it with `format(new Date(value), step.format)` — `date-fns` `format` renders in the *server* local zone. Now that stored values are UTC ISO, this must render in the contact/workspace zone. The step output is a formatted display string (for example `22/07/2026`), not a new absolute instant. The builder must therefore restrict the output picker to text fields, and the worker must still guard existing/published flows whose `outputFieldId` already points at a temporal custom field.

- [ ] **Step 1: Read the formatDate step**

Run: `grep -n "formatDate\|format(new Date\|step.format" apps/worker/src/integration/handlers/tool-handler.ts`

- [ ] **Step 2: Restrict the output field picker to text fields**

In `apps/builder/src/features/flows/react-flow/steps/format-date/editor.tsx`, leave the input selector as `["date", "datetime"]`, but restrict `outputFieldId` to non-temporal text fields:

```tsx
            <CustomFieldSelect
              allowCreate={true}
              customFieldTypes={["shortText", "longText"]}
              label={t("fields.outputCustomField.label")}
              name="outputFieldId"
              required
            />
```

This mirrors the existing `count-characters` editor pattern (`customFieldTypes={["number"]}`) and prevents newly edited flows from choosing `date`/`datetime` as the formatted-string target. Keep the worker guard below because stored flow versions and non-UI writes can still carry an old temporal `outputFieldId`.

- [ ] **Step 3: Replace `format` with `formatInTimeZone` and guard the output field type**

Use the timezone selected on the step (`contact` = Contact → Workspace fallback, `workspace` = Workspace only), then run it through `normalizeStoredTimezone` + `resolveFilterTimezone` before calling `formatInTimeZone` from `date-fns-tz` (already a worker dependency):

```ts
import {
  contactCustomFieldService,
  externalRequestService,
} from "@chatbotx.io/business"
import { normalizeStoredTimezone } from "@chatbotx.io/business/contact-locale"
import { formatInTimeZone } from "date-fns-tz"
import {
  type CustomFieldType,
  customFieldTypes,
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import {
  type CountCharactersStepSchema,
  type ExternalRequestStepSchema,
  type FormatDateStepSchema,
  type GenerateCodeStepSchema,
  FormatTimezone,
  GenerateCodeType,
  type GetDataFromJsonStepSchema,
} from "@chatbotx.io/flow-config"
import { resolveFilterTimezone } from "@chatbotx.io/utils/datetime"
```

Remove the old `format` import from `date-fns`; `formatDate` is the only user of it in this file.

Then replace the write body of `formatDate` with the service path:

```ts
  const outputCustomField = await db.query.customFieldModel.findFirst({
    where: { id: step.outputFieldId, workspaceId: conversation.workspaceId },
    columns: { name: true, type: true },
  })
  if (!outputCustomField) {
    return
  }
  const outputType = outputCustomField.type as CustomFieldType
  if (
    outputType === customFieldTypes.enum.date ||
    outputType === customFieldTypes.enum.datetime
  ) {
    return
  }

  const [contact, workspace] = await Promise.all([
    db.query.contactModel.findFirst({
      where: {
        id: conversation.contactId,
        workspaceId: conversation.workspaceId,
      },
      columns: { timezone: true },
    }),
    db.query.workspaceModel.findFirst({
      where: { id: conversation.workspaceId },
      columns: { timezone: true },
    }),
  ])

  const sourceTimezone =
    step.timezone === FormatTimezone.workspace
      ? workspace?.timezone
      : contact?.timezone ?? workspace?.timezone
  const timezone = resolveFilterTimezone(normalizeStoredTimezone(sourceTimezone))
  const inputDate = new Date(inputContactCustomField.value)
  if (Number.isNaN(inputDate.getTime())) {
    return
  }
  const formatted = formatInTimeZone(inputDate, timezone, step.format)

  await contactCustomFieldService.setValues({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    fields: [
      {
        customFieldId: step.outputFieldId,
        value: formatted,
      },
    ],
  })
```

Delete the old direct `db.insert(contactCustomFieldModel)` / `emitCustomFieldChanged(...)` block for this step. `setValues` handles upsert, change event, and cache invalidation. Because the output field type is pre-guarded as non-temporal, omitting `sourceTimezone` stores the formatted string verbatim instead of trying to reinterpret it as an instant.

- [ ] **Step 4: Add worker tests for formatted output writes**

Create `apps/worker/__tests__/format-date-handler.test.ts`:

```ts
import { formatDateStepDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  inputFieldFindFirst: vi.fn(),
  outputFieldFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  workspaceFindFirst: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: {
    setValues: mocks.setValues,
  },
  externalRequestService: {
    execute: vi.fn(),
    executeAndMap: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business/contact-locale", () => ({
  normalizeStoredTimezone: (timezone: string | null | undefined) => timezone,
}))

vi.mock("@chatbotx.io/utils/datetime", () => ({
  resolveFilterTimezone: (timezone: string | null | undefined) => timezone ?? "UTC",
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {
    query: {
      contactCustomFieldModel: {
        findFirst: mocks.inputFieldFindFirst,
      },
      customFieldModel: {
        findFirst: mocks.outputFieldFindFirst,
      },
      contactModel: {
        findFirst: mocks.contactFindFirst,
      },
      workspaceModel: {
        findFirst: mocks.workspaceFindFirst,
      },
    },
  },
  inArray: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: vi.fn(),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(),
  },
  extractVariables: vi.fn(),
  getSystemFieldValue: vi.fn(),
  interpolate: vi.fn(),
  resolveContactVariablesDeep: vi.fn(),
}))

const { formatDate } = await import("../src/integration/handlers/tool-handler")

const createProps = (
  overrides: {
    outputFieldId?: string
    timezone?: "contact" | "workspace"
  } = {},
) =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    contactInbox: {
      id: "contact-inbox-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
    },
    step: {
      ...formatDateStepDefaultFn(),
      id: "step-1",
      inputFieldId: "input-field",
      outputFieldId: overrides.outputFieldId ?? "output-field",
      format: "yyyy-MM-dd HH:mm",
      timezone: overrides.timezone ?? "contact",
    },
  }) as Parameters<typeof formatDate>[0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inputFieldFindFirst.mockResolvedValue({
    value: "2026-07-22T08:30:00.000Z",
  })
  mocks.contactFindFirst.mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
  mocks.workspaceFindFirst.mockResolvedValue({ timezone: "UTC" })
})

describe("formatDate step handler", () => {
  test("formats the stored UTC value in the resolved contact timezone and writes text", async () => {
    mocks.outputFieldFindFirst.mockResolvedValue({
      type: "shortText",
    })

    await formatDate(createProps())

    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields: [
        {
          customFieldId: "output-field",
          value: "2026-07-22 15:30",
        },
      ],
    })
  })

  test("uses the workspace timezone when the step is configured for workspace", async () => {
    mocks.outputFieldFindFirst.mockResolvedValue({
      type: "shortText",
    })

    await formatDate(createProps({ timezone: "workspace" }))

    expect(mocks.setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [
          {
            customFieldId: "output-field",
            value: "2026-07-22 08:30",
          },
        ],
      }),
    )
  })

  test("does not write formatted text into temporal output fields", async () => {
    mocks.outputFieldFindFirst.mockResolvedValue({
      type: "datetime",
    })

    await formatDate(createProps())

    expect(mocks.setValues).not.toHaveBeenCalled()
    expect(mocks.contactFindFirst).not.toHaveBeenCalled()
    expect(mocks.workspaceFindFirst).not.toHaveBeenCalled()
  })
})
```

This protects both the desired timezone formatting and existing saved flow versions that predate the UI restriction.

- [ ] **Step 5: Run the focused test**

Run: `pnpm --filter worker test format-date-handler`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter builder check-types && pnpm --filter worker check-types`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/builder/src/features/flows/react-flow/steps/format-date/editor.tsx apps/worker/src/integration/handlers/tool-handler.ts apps/worker/__tests__/format-date-handler.test.ts
git commit -m "fix(worker): format stored UTC custom-field dates in the contact timezone"
```

---

## PHASE 7 — Legacy Backfill Migration (§4.8)

**Why an auto-running SQL migration.** ChatbotX is open-source: self-hosters upgrade by running `pnpm --filter @chatbotx.io/database db:migrate` and nothing else. The legacy backfill therefore ships as a **normal Drizzle migration file** so it runs automatically alongside every other migration — no bespoke script anyone has to know about. The runner wraps each file in one transaction (`run-migrations.mjs:77`), so this is **one idempotent, set-based `UPDATE` per type**, not a commit-per-batch loop. That is safe here: it touches only naive `date`/`datetime` rows, it is guarded to skip anything already `Z`/offset-stamped (safe to re-run), and a plain `UPDATE` takes `ROW EXCLUSIVE` — which does **not** block reads or other writes to the table.

**DST-correct and consistent with the write path.** Postgres `AT TIME ZONE` reads the same IANA tzdata as `date-fns-tz`, so the SQL reproduces exactly what the write engine (`filterValueToUtcIso` / `filterValueToUtcDayStartIso`) produces. The exact conversion vectors — including DST — are locked by an automated test against that shared engine in Task 7.1, so the migration's expected outputs are pinned even though this repo has no DB-backed test harness to unit-test the SQL directly. Legacy values are interpreted in each row's **workspace timezone**.

Precedent for a hand-written data `UPDATE` inside a migration: `packages/database/drizzle/20260721002016_add_smart_delay_metadata/migration.sql`.

### Task 7.1: Lock the exact backfill vectors in the Phase 0 oracle test

**Purpose:** The migration's `AT TIME ZONE` SQL cannot be unit-tested in this repo (no DB test harness; every `packages/database/__tests__` test is pure-logic). Instead, pin the *exact expected outputs* the SQL must reproduce as automated assertions against the shared write-path engine. The migration is then a faithful mirror of tested vectors, not hand-verified math.

**Files:**
- Modify: `packages/utils/__tests__/datetime.test.ts` (extend Phase 0's suite with the backfill golden vectors, incl. DST)

**Interfaces:**
- Consumes: `filterValueToUtcIso`, `filterValueToUtcDayStartIso` from `@chatbotx.io/utils/datetime` (Phase 0).
- Produces: no new export — a test-only contract fixing the vectors the Phase 7 SQL reproduces.

- [ ] **Step 1: Add the golden-vector assertions**

Append to the `describe` block in `packages/utils/__tests__/datetime.test.ts`:

```ts
describe("legacy backfill vectors (reproduced by the Phase 7 migration SQL)", () => {
  const VN = "Asia/Ho_Chi_Minh" // UTC+7, no DST
  const NY = "America/New_York" // has DST — catches offset bugs VN cannot

  it("datetime: naive wall-clock → UTC instant in the workspace zone", () => {
    expect(filterValueToUtcIso("2026-07-22 15:30", VN)).toBe(
      "2026-07-22T08:30:00.000Z",
    )
  })

  it("date: naive day → UTC start-of-day instant", () => {
    expect(filterValueToUtcDayStartIso("2026-07-22", VN)).toBe(
      "2026-07-21T17:00:00.000Z",
    )
  })

  it("datetime is DST-correct in summer (EDT = UTC-4)", () => {
    // 2026-07-01 12:00 New York is EDT → 16:00Z (not 17:00Z).
    expect(filterValueToUtcIso("2026-07-01 12:00", NY)).toBe(
      "2026-07-01T16:00:00.000Z",
    )
  })

  it("datetime is DST-correct in winter (EST = UTC-5)", () => {
    // 2026-01-01 12:00 New York is EST → 17:00Z.
    expect(filterValueToUtcIso("2026-01-01 12:00", NY)).toBe(
      "2026-01-01T17:00:00.000Z",
    )
  })

  it("date start-of-day is DST-correct at the spring-forward boundary", () => {
    // DST 2026 begins 2026-03-08 02:00 in NY; midnight is still EST (UTC-5).
    expect(filterValueToUtcDayStartIso("2026-03-08", NY)).toBe(
      "2026-03-08T05:00:00.000Z",
    )
  })
})
```

- [ ] **Step 2: Run the test — expect pass**

Run: `pnpm --filter @chatbotx.io/utils test datetime`
Expected: PASS. These are the exact strings the migration SQL must produce (verified against a staging dry-run in Task 7.2, Step 4).

- [ ] **Step 3: Commit**

```bash
git add packages/utils/__tests__/datetime.test.ts
git commit -m "test(utils): lock legacy custom-field backfill vectors incl. DST"
```

---

### Task 7.2: Write the backfill migration (INSPECT ONLY — do not apply)

**Files:**
- Create: a data-only Drizzle migration at `packages/database/drizzle/<timestamp>_backfill_custom_field_datetime_utc/migration.sql`

Verified schema identifiers (from `packages/database/src/schema/*.ts`):
- `"ContactCustomField"` — `value` (text, NOT NULL), `contactId`, `customFieldId`
- `"CustomField"` — `type` (Postgres enum incl. `date`, `datetime`), `id`
- `"Contact"` — `workspaceId`, `id`
- `"Workspace"` — `timezone` (text, NOT NULL DEFAULT `'UTC'`), `id`

- [ ] **Step 1: Scaffold an empty (custom) migration**

Because there is no schema change, `drizzle-kit generate` emits nothing. Scaffold an empty migration (with a valid snapshot) for hand-written SQL:

Run: `pnpm --filter @chatbotx.io/database exec drizzle-kit generate --custom --name=backfill_custom_field_datetime_utc`
Expected: a new `packages/database/drizzle/<timestamp>_backfill_custom_field_datetime_utc/` folder containing an empty `migration.sql` and a `snapshot.json`. (If `--custom` is unavailable in this drizzle-kit version, create the folder by hand mirroring the newest migration folder: copy its `snapshot.json` in and start `migration.sql` empty.)

- [ ] **Step 2: Write the two idempotent UPDATEs into `migration.sql`**

```sql
-- Reinterpret legacy naive datetime custom-field values as UTC, using each
-- contact's workspace timezone. AT TIME ZONE reads the same tzdata as the
-- write path (date-fns-tz), so results match filterValueToUtcIso exactly.
-- Idempotent: the guards skip values already carrying Z/offset.
UPDATE "ContactCustomField" AS ccf
SET "value" = to_char(
  ((ccf."value")::timestamp AT TIME ZONE w."timezone") AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
)
FROM "CustomField" AS cf, "Contact" AS c, "Workspace" AS w
WHERE ccf."customFieldId" = cf."id"
  AND c."id" = ccf."contactId"
  AND w."id" = c."workspaceId"
  AND cf."type" = 'datetime'
  AND ccf."value" ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}'
  AND ccf."value" !~ '(Z|[+-]\d{2}:?\d{2})$';
--> statement-breakpoint
-- Reinterpret legacy naive date values as the UTC start-of-day in the
-- workspace zone (mirrors filterValueToUtcDayStartIso).
UPDATE "ContactCustomField" AS ccf
SET "value" = to_char(
  ((left(ccf."value", 10))::date::timestamp AT TIME ZONE w."timezone") AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
)
FROM "CustomField" AS cf, "Contact" AS c, "Workspace" AS w
WHERE ccf."customFieldId" = cf."id"
  AND c."id" = ccf."contactId"
  AND w."id" = c."workspaceId"
  AND cf."type" = 'date'
  AND ccf."value" ~ '^\d{4}-\d{2}-\d{2}'
  AND ccf."value" !~ '(Z|[+-]\d{2}:?\d{2})$';
```

Notes for the implementer:
- The two statements are separated by drizzle's `--> statement-breakpoint` (the runner splits on it).
- `cf."type" = 'datetime'` compares the enum column to an unknown literal — Postgres casts it to the enum type automatically.
- `to_char(..., 'MS')` emits 3-digit milliseconds, so whole-second instants render `.000Z` — byte-identical to JS `toISOString()` and to the Task 7.1 vectors.
- Equivalence to the golden vectors (Task 7.1): `'2026-07-22 15:30'` @ `Asia/Ho_Chi_Minh` → `2026-07-22T08:30:00.000Z`; `'2026-07-22'` (date) → `2026-07-21T17:00:00.000Z`; `'2026-07-01 12:00'` @ `America/New_York` → `2026-07-01T16:00:00.000Z`.

- [ ] **Step 3: Inspect the generated SQL**

Run: `git diff -- packages/database/drizzle` (or open the new `migration.sql`).
Verify both statements, the guards, the identifiers, and that no schema-diff noise leaked into the file.

- [ ] **Step 4: STOP — staging dry-run + explicit approval before applying**

Do **not** run `db:migrate` automatically (project rule — see AGENTS.md migration-safety). Present the migration file plus a read-only impact estimate and a spot-check that reproduces the Task 7.1 vectors, and wait for explicit approval:

```sql
-- Row-impact estimate (read-only)
SELECT cf.type, count(*)
FROM "ContactCustomField" ccf JOIN "CustomField" cf ON cf.id = ccf."customFieldId"
WHERE cf.type IN ('date','datetime') AND ccf.value !~ '(Z|[+-]\d{2}:?\d{2})$'
GROUP BY cf.type;

-- Spot-check the transform on a staging copy (read-only): must match the
-- Task 7.1 golden vectors for the same inputs before applying for real.
SELECT to_char((('2026-07-22 15:30')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
  AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS datetime_vn,   -- 2026-07-22T08:30:00.000Z
  to_char(((left('2026-07-22',10))::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
  AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS date_vn,       -- 2026-07-21T17:00:00.000Z
  to_char((('2026-07-01 12:00')::timestamp AT TIME ZONE 'America/New_York')
  AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS datetime_ny;   -- 2026-07-01T16:00:00.000Z
```

Only after approval does anyone run `pnpm --filter @chatbotx.io/database db:migrate`. Deployment ordering: run the migration **after** the write-path changes (Phases 1–6) are live, so new writes are already ISO and the idempotent guards leave them untouched.

- [ ] **Step 5: Commit the migration (not applied)**

```bash
git add packages/database/drizzle/<timestamp>_backfill_custom_field_datetime_utc
git commit -m "chore(database): backfill legacy custom-field date/datetime values to UTC"
```

---

## Final Verification

- [ ] **Repo-wide lint + circular-dep check**

Run: `pnpm lint && pnpm check:circular`
Expected: clean.

- [ ] **Touched-package typecheck sweep**

Run: `pnpm --filter @chatbotx.io/utils --filter @chatbotx.io/ui --filter @chatbotx.io/database --filter @chatbotx.io/business --filter @chatbotx.io/variables --filter builder --filter worker check-types`
Expected: no errors.

- [ ] **Full test sweep for touched packages**

Run: `pnpm --filter @chatbotx.io/utils --filter @chatbotx.io/database --filter @chatbotx.io/business --filter @chatbotx.io/variables --filter worker test`
Expected: PASS.

- [ ] **Invariant guard on the full diff**

Dispatch the `invariant-guard` subagent over the complete branch diff — confirm no direct `db` in app/integration layers, all writes go through `setValues`, no dynamic imports, i18n intact.

- [ ] **Security review**

Dispatch `security-reviewer` on `custom-field-predicates.ts` and the migration SQL — confirm all filter values bind through Drizzle `sql` parameters (no interpolation) and the migration cannot be steered by user input.

---

## Self-Review Checklist (author ran before handoff)

**Spec coverage:** §4.1 → Phase 0; §4.2 → Phases 1-2, incl. **the contact-import write path (bypass site 5) → Task 2.5** (browser-tz capture in the upload form → `importContactsRequest`/`contactImportMetaSchema` → both meta-builders → worker `prepareContacts` resolving `meta.timezone ? resolveFilterTimezone(...) : workspace.timezone` → tz-aware `validateCustomFieldValue` delegating to the Phase 0 engine; token-API imports fall back to workspace tz); §4.3 → Task 3.1; §4.4 → Task 3.2; §4.5 → Phase 4; **§4.5b (read surfaces) → Phase 4B** (4B.1 public API canonical-ISO lock; 4B.2 CSV export workspace-tz; 4B.3 contact-detail browser-local display + ISO edit round-trip); §4.6 → Phase 5; §4.7 → Phase 6; §4.8 → Phase 7. ✅

**Read-surface contract honored:** every place a stored ISO value is read back is pinned to its locked contract — public API returns canonical UTC ISO verbatim (no formatter; 4B.1 regression-locks it), CSV export formats via `formatCustomFieldValueInTimeZone` in the workspace zone (4B.2), contact-detail display formats via the same helper in the browser zone with `formValue` carrying raw ISO for the `saveFormat="iso"` picker round-trip (4B.3), and variable rendering formats in the workspace zone (Phase 4). The three formatting routes share `formatCustomFieldValueInTimeZone` (Phase 0); the API route intentionally bypasses it. ✅

**Type consistency:** `normalizeCustomFieldValueForStorage`, `createSourceTimezoneResolver`, `SourceTimezoneResolver`, `renderCustomFieldValue`, `buildCustomFieldWhere(condition, timezone)`, `hasExplicitOffset`, `formatCustomFieldValueInTimeZone(type, value, timezone)`, the `SelectedField` custom variant's `customFieldType`, `renderCell(contact, field, timezone)` / `buildCsvChunk(contacts, selectedFields, timezone)`, `DatePickerField` / `DateTimePickerField` / `BotFieldValueInput` `saveFormat?: "formatted" | "iso"`, `toDisplayValue(field, rawValue)`, and the `formatDate` text-output guard are named identically at definition and every call site. ✅

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the only discovery-driven steps (Task 2.0 inventory, Task 3.2 audit, Task 4B.2 Steps 8-9 handler call-site threading) provide exact grep commands and expected results. ✅

**High request volume (rubric #16):** write-path normalization is O(1) per value with a memoized per-batch source-timezone resolver (Phase 1, one Contact/Workspace fetch reused across a `setValues` call); filter predicates emit index-friendly range bounds, not per-row function calls (Phase 3); the read-surface formatter is a pure in-memory format (no I/O). The Phase 7 backfill ships as an auto-running migration but touches only naive `date`/`datetime` rows, is idempotent (skips already-`Z` rows), and takes `ROW EXCLUSIVE` (does not block table reads/writes). ✅

**All cases tested (rubric #17):** conversion + DST vectors locked in Phase 0 and re-pinned as the migration oracle in Task 7.1; storage-normalizer cases (incl. offset passthrough, timezone override, Contact→Workspace→UTC fallback) in Phase 1; **import-normalizer cases in Task 2.5** (`validateCustomFieldValue` date UTC-day-start `"2026-05-19"`@VN→`"2026-05-18T17:00:00.000Z"`, naive datetime `"2026-05-19T10:00:00"`@VN→`"2026-05-19T03:00:00.000Z"`, `Z`/explicit-offset passthrough, per-zone divergence, and the reject cases); datetime custom-field predicate assertions in Phase 3; variable render in Phase 4; read surfaces (canonical-ISO API lock, CSV workspace-tz, contact-detail date/datetime round-trip) in Phase 4B; `formatDate` temporal-output no-op guard in Phase 6. The migration SQL is a faithful mirror of the Task 7.1 vectors, verified by a staging dry-run + spot-check (this repo has no DB-backed test harness — every `packages/database/__tests__` test is pure-logic — so the SQL is verified by the oracle + dry-run, not a new integration test). ✅
