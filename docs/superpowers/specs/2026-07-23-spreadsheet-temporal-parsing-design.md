# Design: Multi-format date/datetime parsing for the Spreadsheet flow step

- **Date:** 2026-07-23
- **Status:** Draft design — pending user review of flagged assumptions
- **Baseline branch:** `feat/timezone-aware-custom-fields` (PR #807, builds on the timezone-aware custom-field work)
- **Author context:** Follow-up to the timezone-aware custom-field feature. That work made the *storage/anchoring* correct but left the *input parser* accepting only ISO. The Google Sheets "get row" / "get random row" flow steps feed raw sheet cells into custom fields, and those cells are almost never ISO — so temporal values are silently dropped.

---

## 1. Problem

The spreadsheet flow steps map a sheet row's cells into contact custom fields. For a `date` / `datetime` custom field the mapped cell string funnels through `contactCustomFieldService.setValues()` → `normalizeCustomFieldValueForStorage` → `normalizeTemporalCustomFieldValue` (`packages/utils/src/datetime.ts`), which **only accepts ISO `yyyy-MM-dd[THH:mm:ss]`**.

But `getSheetValues` (`integrations/google-sheets/src/integration.ts`) calls the Sheets API `values.get` with **no `valueRenderOption`**, so the API returns its documented default `FORMATTED_VALUE`: date cells arrive as **locale display strings** (`23/07/2026`, `23 Jul 2026 14:30`) and number-formatted cells (e.g. a user-typed unix timestamp) arrive as **bare numeric strings** (`1721721600`). None of these match ISO → the normalizer returns `null` → `setValues` **silently skips the field** (`service.ts:148`). Result: sheet-sourced dates mostly never get stored.

## 2. Goal

Parse **as many real-world temporal formats as possible** from sheet cells and store them correctly, honoring the workspace timezone for values that carry no timezone of their own.

### Timezone semantics (the crux — confirmed with user)

A naive sheet value is the **workspace wall-clock itself**. It is interpreted *as* workspace-local; it is **never** treated as UTC and then shifted. With workspace tz = `Asia/Ho_Chi_Minh` (+07):

| Field type | Input cell | Interpretation | Stored value | Round-trips to |
|------------|-----------|----------------|--------------|----------------|
| `datetime` | `23/07/2026` | `2026-07-23 00:00 +07` | `2026-07-22T17:00:00.000Z` (UTC instant) | `2026-07-23 00:00:00` |
| `datetime` | `23/07/2026 09:00` | `2026-07-23 09:00 +07` | `2026-07-23T02:00:00.000Z` | `2026-07-23 09:00:00` |
| `date` | `23/07/2026` | calendar day in +07 | `2026-07-23T00:00:00+07:00` (offset-preserved) | `2026-07-23` |

This is the existing, correct behavior of `filterValueToUtcIso` (datetime) and `toZonedDayStartIso` (date). Both use `fromZonedTime(wallClock, workspaceTz)` — interpret-as-local — **not** `new Date(value + "Z")`. This design changes **only** the input-format front-end that produces the canonical string those functions already expect.

### Absolute-instant inputs

A **unix timestamp** or an **offset-bearing string** (`…Z`, `…+07:00`) is an *absolute instant* — it carries its own point in time, so the workspace tz is **not** applied:
- `datetime` field → store the instant directly as UTC.
- `date` field → the calendar day **as seen in the workspace tz** (for consistency with the "everything is workspace-local" rule).

### Non-goals

- No change to the **CSV import** path (`apps/worker/src/default/handlers/imports/validations/custom-field-value.ts`) — it keeps today's ISO-only behavior. (User scope choice: "spreadsheet step only".)
- No change to `getSheetValues` / the Google Sheets integration render option (that call is shared by lookup/filter logic — changing it is out of scope and risky).
- No change to the `send` / `update` / `clear` spreadsheet directions (they read *from* fields, not into them).
- No new user-facing UI. Format detection is automatic; timezone is derived, never asked.
- Google Sheets **serial date numbers** (days since 1899-12-30) are not specially decoded — with `FORMATTED_VALUE` they don't occur for date-formatted cells, and treating an arbitrary integer as a serial would collide with unix timestamps.

---

## 3. Key discoveries (verified against code + docs)

1. **Silent-drop root cause is the render option.** `values.get` uses Google's default `FORMATTED_VALUE`; no override exists in the integration (grep-confirmed). Verified against googleapis v171.
2. **date-fns v4.4.0 `parse(str, fmt, ref, opts)` is self-validating.** It returns `Invalid Date` when *trailing input remains* (confirmed in the library's own test suite), so an ordered list of exact format strings cannot mis-match (`'dd/MM/yyyy'` will not match `23/07/2026 14:30`). `{ strictValidation: true }` rejects impossible dates (Feb 31, month 13) — this powers the DMY→MDY rescue.
3. **`parse` yields a Date in system-local components.** Reformatting the same Date with date-fns `format` (also system-local) round-trips the wall-clock regardless of the host tz — so naive values stay naive with no accidental tz math.
4. **The project idiom is the strategy/handler-map pattern**, never if-else ladders: `temporalCustomFieldNormalizationHandlers`, `customFieldValueNormalizers`, `cleanCell`/`EMAIL_RE`. The new parser mirrors this with an ordered `readonly` matcher array.
5. **`setValues` already memoizes one source-tz resolver per call** and runs inside a transaction. Adding a `Workspace` strategy that skips the contact lookup removes one query per call (throughput win at chatbot scale).
6. **The anchoring layer is reusable as-is.** `normalizeTemporalCustomFieldValue` + `filterValueToUtcIso` + `toZonedDayStartIso` already do exactly the tz semantics in §2 — the new code must *feed* them, not duplicate them.

---

## 4. Architecture

Three coordinated changes. The parser is pure and lives in `@chatbotx.io/utils`; the orchestration lives in the business layer; the worker handler stays thin.

### 4.1 New pure module — `packages/utils/src/temporal-input.ts`

Exports `parseLooseTemporalValue(type, raw, anchorTimezone): string | null`.

- `type: TemporalCustomFieldType` (`"date" | "datetime"`)
- `raw: string` — the sheet cell
- `anchorTimezone: string` — workspace tz, used **only** to project an absolute instant onto a calendar day for the `date` type
- returns a **canonical string** the existing normalizer accepts, or `null` if unrecognized.

**Strategy pattern — ordered matcher array, first match wins:**

```ts
type TemporalParseResult =
  | { kind: "naive"; date: Date }       // wall-clock; anchored later by the normalizer
  | { kind: "absolute"; instant: Date } // fixed instant (unix / offset)

type TemporalMatcher = {
  readonly name: string
  readonly parse: (raw: string) => TemporalParseResult | null
}

const TEMPORAL_MATCHERS: readonly TemporalMatcher[] = [
  isoOrOffsetMatcher,   // offset/Z → absolute; bare ISO → naive (pass-through, zero behavior change)
  unixTimestampMatcher, // /^-?\d+$/ → absolute; seconds vs ms via UNIX_MS_THRESHOLD (1e12)
  ...FORMAT_MATCHERS,   // date-fns parse() over CANONICAL_INPUT_FORMATS → naive
]
```

- `CANONICAL_INPUT_FORMATS: readonly string[]` — ISO variants first (cheapest, canonical), then DMY variants, then MDY (rescue), then named-month, then YMD. **Adding a format later = append one string.**
- Output projection is a small type-directed map (`date` → `yyyy-MM-dd`, `datetime` → `yyyy-MM-dd'T'HH:mm:ss`) so both types share one matcher list — **no duplicate code**.
  - `naive` + `date` → `format(date, "yyyy-MM-dd")`
  - `naive` + `datetime` → `format(date, "yyyy-MM-dd'T'HH:mm:ss")`
  - `absolute` + `datetime` → `instant.toISOString()` (→ normalizer stores as UTC)
  - `absolute` + `date` → `formatInTimeZone(instant, anchorTimezone, "yyyy-MM-dd")` (workspace-local calendar day)

**Determinism rules:**
- DMY-first: ambiguous `7/8/2026` → 8 Aug. Structurally-impossible-DMY `07/13/2026` falls through (strictValidation rejects month 13) to MDY → 13 Jul. *(Flagged assumption: keep MDY rescue.)*
- Unix unit: `abs(n) >= 1e12` → milliseconds, else seconds (`1e12`s ≈ year 33658, so modern seconds < threshold; modern ms ≈ 1.7e12 ≥ threshold).
- Uses single-token `d`/`M` forms (tolerate unpadded) + `strictValidation: true`.

### 4.2 Business layer — typed enums + threaded options

Two enums in `packages/utils/src/datetime.ts` (co-located with the temporal types they govern):

```ts
export const TemporalInputParsing = { Strict: "strict", Lenient: "lenient" } as const
export type TemporalInputParsing =
  (typeof TemporalInputParsing)[keyof typeof TemporalInputParsing]

export const SourceTimezoneStrategy = {
  ContactThenWorkspace: "contactThenWorkspace",
  Workspace: "workspace",
} as const
export type SourceTimezoneStrategy =
  (typeof SourceTimezoneStrategy)[keyof typeof SourceTimezoneStrategy]
```

- **`packages/business/src/contact-custom-field/normalize.ts`**
  - `normalizeCustomFieldValueForStorage` gains `temporalInputParsing?: TemporalInputParsing` (default `Strict`). When `Lenient` and the type is temporal, it first calls `parseLooseTemporalValue(type, value, anchorTz)` and feeds the canonical result into the existing `normalizeTemporalCustomFieldValue`. `Strict` = today's behavior.
  - `createSourceTimezoneResolver` gains `strategy?: SourceTimezoneStrategy` (default `ContactThenWorkspace`). `Workspace` resolves **workspace tz only** via the existing `db.query.workspaceModel` relational query (parameterized — no raw SQL), skipping the contact lookup.
- **`packages/business/src/contact-custom-field/service.ts`**
  - `SetValuesInput` gains `temporalInputParsing?` and `sourceTimezoneStrategy?`. `setValues` forwards both. All existing callers keep defaults → **behavior unchanged, running flows not broken.**

### 4.3 Thin worker handler

`apps/worker/src/integration/handlers/spreadsheet-handler.ts` `updateContactCustomFields` — one call, no parsing logic in the app layer:

```ts
await contactCustomFieldService.setValues({
  workspaceId: conversation.workspaceId,
  contactId: conversation.contactId,
  fields,
  temporalInputParsing: TemporalInputParsing.Lenient,
  sourceTimezoneStrategy: SourceTimezoneStrategy.Workspace,
})
```

Add a `logger.warn` (via the existing `logger`) when a mapped temporal cell parses to `null`, so operators can diagnose a dropped value — the step still returns `success` (a hard failure could break flows). *(Flagged assumption.)*

---

## 5. Data flow

```
Sheet cell "23/07/2026"
  → spreadsheet-handler.updateContactCustomFields (maps header→customFieldId)
  → contactCustomFieldService.setValues({ ..., Lenient, Workspace })
  → resolver = createSourceTimezoneResolver({ strategy: Workspace })  // workspace tz only
  → normalizeCustomFieldValueForStorage({ type, value, temporalInputParsing: Lenient })
      → parseLooseTemporalValue("datetime", "23/07/2026", wsTz)  → "2026-07-23T00:00:00"
      → normalizeTemporalCustomFieldValue("datetime", "2026-07-23T00:00:00", wsTz)
          → filterValueToUtcIso → fromZonedTime(..., wsTz) → "2026-07-22T17:00:00.000Z"
  → stored: "2026-07-22T17:00:00.000Z"
```

## 6. Edge cases (documented behavior)

| Input | `datetime` | `date` |
|-------|-----------|--------|
| `23/07/2026` | 00:00 wsTz → UTC | offset-preserved `…+07:00` |
| `23/07/2026 09:00` | 09:00 wsTz → UTC | date part, offset-preserved |
| `1721721600` (unix s) | UTC instant | wsTz calendar day |
| `1721721600000` (unix ms) | UTC instant | wsTz calendar day |
| `2026-07-23T14:30:00+07:00` | offset → UTC | wsTz calendar day |
| `07/13/2026` | MDY rescue → 13 Jul | 13 Jul |
| `Jul 23, 2026`, `23 July 2026 2:30 PM` | named month | named month |
| garbage / empty | `null` → skipped + `logger.warn` | same |

## 7. Performance (chatbot scale)

- Matchers short-circuit on first hit; ISO and unix are pure regex (no `parse()` cost) and cover the common cases.
- Format list is a fixed ~14 entries — bounded, no runaway loops.
- `Workspace` strategy drops the per-call contact query; the resolver stays memoized (one tz lookup per `setValues`).

## 8. Testing (all cases covered)

- **`packages/utils/__tests__/temporal-input.test.ts`** (new): every row of the §6 matrix; DMY/MDY-rescue boundary (`12/12/2026` stays DMY vs `13/07/2026` rescues); unix s/ms threshold; offset pass-through; invalid/empty/whitespace → `null`; `date` vs `datetime` output shape; absolute→date uses `anchorTimezone`.
- **`packages/utils/__tests__/datetime.test.ts`**: loose→normalize round-trip under a `+07:00` workspace for both types (asserts the §2 stored values).
- **`packages/business/.../contact-custom-field/__tests__`**: `setValues` with `Lenient` + `Workspace` stores correct UTC/offset; `Strict` (default) path unchanged (regression guard); `Workspace` skips the contact query.
- **`apps/worker/__tests__`**: spreadsheet handler maps each format to the correct stored value; unparseable cell logs a warning and the step still succeeds.

## 9. Flagged assumptions (please confirm on review)

1. **"thuộc tính time" = the `date` custom-field type** (the codebase has only `date` and `datetime`).
2. **unix-timestamp → `date` field** resolves the calendar day in the **workspace tz** (not UTC).
3. **MDY rescue** for structurally-impossible-DMY values is kept.
4. **`logger.warn` on an unparseable cell**; the step still succeeds (no hard failure).
