# FB Marketing Messages — Custom Audience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Audiences" tab to the FB Marketing Messages page where a user uploads a subscriber file (CSV/TXT/XLSX) that becomes a Messenger Marketing Messages Custom Audience on Meta, and track its match count and "Ready" status.

**Architecture:** Pure parsing/normalization/hashing lives in `integrations/facebook-ads/src/customer-file/` (own package export, `node:crypto`); Graph calls in `integrations/facebook-ads/src/apis/marketing-messages-audiences.ts`; a generic tabular reader in `packages/imports`; persistence in a new `FacebookMarketingMessageAudience` table + repository; orchestration in a new `facebookMarketingMessageAudienceService` in `packages/business`; the builder adds server actions, two oRPC queries, a tab switcher, a table, and a 3-step dialog wizard.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), oRPC, next-safe-action + react-hook-form, TanStack Query/Table, next-intl, csv-parse, exceljs, libphonenumber-js, ky (Graph client), vitest + msw.

**Spec:** `docs/superpowers/specs/2026-10-04-fb-marketing-messages-custom-audience-design.md` (decisions D1–D26). Read it before starting any task.

## Global Constraints

- Supported identifiers: EMAIL, PHONE (at least one valid per row) + FN, LN, CT, ST, ZIP, COUNTRY, DOB (→ DOBY/DOBM/DOBD), DOBY, GEN, MADID. No Age, no App/Page/IG-scoped IDs (D3).
- Canonical schema order sent to Meta: `EMAIL, PHONE, FN, LN, CT, ST, ZIP, COUNTRY, DOBY, DOBM, DOBD, GEN, MADID` — only keys present in the file's headers.
- Every value SHA-256 hex hashed except MADID; a missing value is `""`, never `null`, in the payload.
- File formats `.csv`, `.txt`, `.xlsx` only (D7). Max **20 MB** (`20 * 1024 * 1024` bytes), max **100,000** data rows (D5).
- Upload batch size **10,000** rows, one session per upload: `session_id`, `batch_seq` starting at 1, `last_batch_flag` on the last batch, `estimated_num_total`.
- Audience create body: `subtype: "CUSTOM"`, `customer_file_source: "USER_PROVIDED_ONLY"`, `use_for_products: ["MARKETING_MESSAGES"]`, `subscription_info: ["MESSENGER"]`, `marketing_message_channels: { MESSENGER: pageId }`.
- Validate the whole file before any Graph call; the DB row is inserted only after Meta returns an audience id (D9).
- Plain PII is never logged or persisted; log ids and counts only. Logger key is `err`, never `error` (AGENTS.md invariant 20).
- App code never imports `db`; chain is action/oRPC → service → repository (invariant 9).
- Every user-facing string goes through `useTranslations()` / `getTranslations()`, and every key must exist in **all 22** files in `apps/builder/messages/` (`pnpm --filter builder lint` runs `i18n-check`).
- TanStack mutations invalidate both audience queries (invariant 21).
- Actions using `bindArgsSchemas` are bound with `.bind(null, workspaceId)` (invariant 4).
- No dynamic `import()` in `packages/*` / `integrations/*`.
- **Never run `db:migrate`.** Generate with `make:migration`, show the SQL, stop for approval.
- Stage specific files only (never `git add -A` / `git add .`). Don't stage `CLAUDE.md` or the unrelated deleted quick-reply docs in the working tree.
- After each task: `pnpm fix` on touched files is allowed; run the task's tests before committing.

## Review Focus

1. **CSV saved by Excel with a UTF-8 BOM and `;` delimiter (European locale)** — headers must still map (BOM stripped, `;` detected), not fail with `noIdentifier`. Test in Task 1.
2. **Phone column holding numbers without country code and no country column** (e.g. `0912345678`) — those rows must be skipped (or kept via email), never hashed as a wrong identity. Test in Task 2/3.
3. **Upload fails on batch 2 of 3** — row persists with the batch-1 count, user sees the partial count, "Upload more" works afterwards. Test in Task 4 and Task 6.
4. **Audience deleted in Ads Manager** — the live query must mark it `missingOnMeta`, and Delete in ChatbotX must still remove the row when Meta answers "does not exist". Test in Task 7 and Task 6.
5. **One Page's token is revoked while others are fine** — only that Page's rows lose the ready check; the rest of the table still renders. Test in Task 7.

---

## File Structure

**packages/imports**
- Modify `src/parsers/xlsx.ts` — optional `limits` for worksheet reading; export `XlsxLimitError`, `readXlsxRows`.
- Create `src/parsers/tabular.ts` — `readTabularFile`, `detectDelimiter`, `TabularFileError`.
- Modify `src/parsers/index.ts` — re-export tabular.
- Test `__tests__/tabular.test.ts`.

**integrations/facebook-ads**
- Create `src/customer-file/keys.ts`, `normalizers.ts`, `header-map.ts`, `build-payload.ts`, `index.ts`.
- Modify `package.json` — add `"./customer-file"` export.
- Create `src/apis/marketing-messages-audiences.ts`; modify `src/apis/ad-accounts.ts` (export `fetchAllPages`); modify `src/index.ts` (export new apis).
- Tests `__tests__/customer-file-normalizers.test.ts`, `__tests__/customer-file-payload.test.ts`, `__tests__/marketing-messages-audiences.test.ts`.

**packages/database**
- Create `src/schema/facebook-marketing-message-audience.ts`, `src/relations/facebook-marketing-message-audience.ts`, `src/repositories/facebook-marketing-messages/audience-repository.ts`.
- Modify `src/schema/index.ts`, `src/relations/index.ts` (2 edits), `src/types.ts`, `src/repositories/facebook-marketing-messages/index.ts`.
- Generated migration under `drizzle/` (or the package's migrations folder).
- Test `__tests__/facebook-marketing-message-audience-schema.test.ts`.

**packages/business**
- Create `src/facebook-marketing-message-audience/errors.ts`, `service.ts`, `index.ts`; modify `src/index.ts`.
- Tests `__tests__/facebook-marketing-message-audience-service.test.ts`, `__tests__/facebook-marketing-message-audience-live-status.test.ts`.

**apps/builder** (`src/features/facebook-marketing-messages/…`)
- Create `schema/audience.ts`, `lib/audience-errors.ts`, `lib/audience-status.ts`, `lib/tab.ts`.
- Create `actions/create-audience.action.ts`, `actions/upload-more-audience.action.ts`, `actions/delete-audience.action.ts`.
- Modify `api/private.ts` (2 procedures).
- Create `hooks/use-audiences.ts`, `components/marketing-messages-tabs.tsx`, `components/audiences/audiences-table.tsx`, `components/audiences/delete-audience-dialog.tsx`, `components/audiences/create-audience-dialog.tsx`, `components/audiences/step-prepare.tsx`, `components/audiences/step-upload.tsx`, `components/audiences/step-confirm.tsx`.
- Modify `components/marketing-messages-view.tsx`, `src/app/space/[workspaceId]/fb-marketing-messages/page.tsx`.
- Create `public/templates/marketing-messages-audience.csv`.
- Modify all 22 `messages/*.json`.
- Tests `__tests__/marketing-messages-audience-actions.test.ts`, `__tests__/marketing-messages-audience-status.test.ts`.

---

### Task 1: Tabular file reader in `packages/imports`

**Files:**
- Modify: `packages/imports/src/parsers/xlsx.ts`
- Create: `packages/imports/src/parsers/tabular.ts`
- Modify: `packages/imports/src/parsers/index.ts`
- Test: `packages/imports/__tests__/tabular.test.ts`

**Interfaces:**
- Produces:
  - `export type TabularFormat = "csv" | "xlsx"`
  - `export type TabularFile = { headers: string[]; rows: string[][] }`
  - `export class TabularFileError extends Error { readonly reason: "empty" | "tooManyRows" | "invalid" }`
  - `export function detectDelimiter(headerLine: string): "," | ";" | "\t"`
  - `export async function readTabularFile(input: { format: TabularFormat; buffer: Buffer; maxRows: number; maxBytes: number }): Promise<TabularFile>`
  - `xlsx.ts`: `export class XlsxLimitError extends Error { readonly kind: "rows" | "bytes" }`, `export type XlsxLimits = { maxRows?: number; maxCompressedBytes?: number }`, `export async function readXlsxRows(stream: Readable, limits?: XlsxLimits): Promise<string[][]>`

- [ ] **Step 1: Write the failing test**

Create `packages/imports/__tests__/tabular.test.ts`:

```ts
import ExcelJS from "exceljs"
import { describe, expect, test } from "vitest"
import {
  detectDelimiter,
  readTabularFile,
  TabularFileError,
} from "../src/parsers/tabular"

const MB = 1024 * 1024
const csv = (text: string) => Buffer.from(text, "utf8")

async function xlsxBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Sheet1")
  for (const row of rows) {
    sheet.addRow(row)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe("detectDelimiter", () => {
  test("picks the most frequent of , ; and tab in the header line", () => {
    expect(detectDelimiter("email,phone,fn")).toBe(",")
    expect(detectDelimiter("email;phone;fn")).toBe(";")
    expect(detectDelimiter("email\tphone\tfn")).toBe("\t")
    expect(detectDelimiter("email")).toBe(",")
  })
})

describe("readTabularFile — csv", () => {
  test("returns headers and rows as string arrays", async () => {
    const result = await readTabularFile({
      format: "csv",
      buffer: csv("email,phone\na@b.co,123\n\nc@d.co,\n"),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result).toEqual({
      headers: ["email", "phone"],
      rows: [
        ["a@b.co", "123"],
        ["c@d.co", ""],
      ],
    })
  })

  test("strips a UTF-8 BOM and detects ; (Excel European export)", async () => {
    const result = await readTabularFile({
      format: "csv",
      buffer: csv("﻿email;phone\na@b.co;+33 1 23\n"),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result.headers).toEqual(["email", "phone"])
    expect(result.rows).toEqual([["a@b.co", "+33 1 23"]])
  })

  test("keeps quoted delimiters inside a cell", async () => {
    const result = await readTabularFile({
      format: "csv",
      buffer: csv('fn,ct\n"Doe, John","New York"\n'),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result.rows).toEqual([["Doe, John", "New York"]])
  })

  test("pads short rows to the header width", async () => {
    const result = await readTabularFile({
      format: "csv",
      buffer: csv("email,phone,fn\na@b.co\n"),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result.rows).toEqual([["a@b.co", "", ""]])
  })

  test("rejects more than maxRows data rows", async () => {
    await expect(
      readTabularFile({
        format: "csv",
        buffer: csv("email\na\nb\nc\n"),
        maxRows: 2,
        maxBytes: MB,
      }),
    ).rejects.toMatchObject({ reason: "tooManyRows" })
  })

  test("rejects an empty file", async () => {
    await expect(
      readTabularFile({ format: "csv", buffer: csv(""), maxRows: 2, maxBytes: MB }),
    ).rejects.toBeInstanceOf(TabularFileError)
  })
})

describe("readTabularFile — xlsx", () => {
  test("reads the first worksheet, formatting dates as YYYY-MM-DD", async () => {
    const buffer = await xlsxBuffer([
      ["email", "phone", "dob"],
      ["a@b.co", 16505615622, new Date(Date.UTC(1968, 9, 21))],
    ])
    const result = await readTabularFile({
      format: "xlsx",
      buffer,
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result).toEqual({
      headers: ["email", "phone", "dob"],
      rows: [["a@b.co", "16505615622", "1968-10-21"]],
    })
  })

  test("honours a maxRows above the shared 10,000 default", async () => {
    const rows: unknown[][] = [["email"]]
    for (let i = 0; i < 10_050; i++) {
      rows.push([`u${i}@x.co`])
    }
    const result = await readTabularFile({
      format: "xlsx",
      buffer: await xlsxBuffer(rows),
      maxRows: 20_000,
      maxBytes: 20 * MB,
    })
    expect(result.rows).toHaveLength(10_050)
  })

  test("maps the row cap to tooManyRows", async () => {
    await expect(
      readTabularFile({
        format: "xlsx",
        buffer: await xlsxBuffer([["email"], ["a"], ["b"], ["c"]]),
        maxRows: 2,
        maxBytes: MB,
      }),
    ).rejects.toMatchObject({ reason: "tooManyRows" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/imports test -- tabular`
Expected: FAIL — `Cannot find module '../src/parsers/tabular'`.

- [ ] **Step 3: Add limits to the shared XLSX reader**

In `packages/imports/src/parsers/xlsx.ts`:

1. Below the constants, add:

```ts
export type XlsxLimits = { maxRows?: number; maxCompressedBytes?: number }

/** A configured XLSX cap was hit — lets callers map it to their own error. */
export class XlsxLimitError extends Error {
  readonly kind: "rows" | "bytes"

  constructor(kind: "rows" | "bytes", message: string) {
    super(message)
    this.name = "XlsxLimitError"
    this.kind = kind
  }
}
```

2. Change `readBoundedXlsxBuffer` to take the cap and throw the typed error (message text unchanged for the default so existing tests keep passing):

```ts
const readBoundedXlsxBuffer = async (
  stream: Readable,
  maxCompressedBytes: number = MAX_COMPRESSED_XLSX_BYTES,
): Promise<Buffer> => {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > maxCompressedBytes) {
      throw new XlsxLimitError(
        "bytes",
        `XLSX file exceeds the ${Math.round(maxCompressedBytes / (1024 * 1024))}MB compressed size limit`,
      )
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, totalBytes)
}
```

3. Change `collectFirstWorksheet` signature and the row check:

```ts
const collectFirstWorksheet = async (
  stream: Readable,
  limits: XlsxLimits = {},
): Promise<CellValue[][]> => {
  const buffer = await readBoundedXlsxBuffer(stream, limits.maxCompressedBytes)
  await assertXlsxArchiveWithinLimits(buffer)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error("The workbook has no worksheets")
  }
  // +1: the header row is buffered too.
  const maxBufferedRows =
    limits.maxRows === undefined ? MAX_BUFFERED_XLSX_ROWS : limits.maxRows + 1
  const rows: CellValue[][] = []

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length >= maxBufferedRows) {
      throw new XlsxLimitError(
        "rows",
        `XLSX row limit exceeded (${maxBufferedRows - 1})`,
      )
    }
    rows.push(Array.isArray(row.values) ? row.values.slice(1) : [])
  })

  return rows
}
```

4. Append a new export at the bottom:

```ts
const cellToText = (value: CellValue): string => {
  const normalized = toImportCellValue(value)
  if (normalized instanceof Date) {
    return normalized.toISOString().slice(0, 10)
  }
  return normalized === undefined ? "" : String(normalized).trim()
}

/**
 * Raw first-worksheet rows as trimmed strings (header row included), with
 * caller-chosen caps. Dates become `YYYY-MM-DD`. Does NOT wrap errors, so a
 * caller can tell an `XlsxLimitError` from a corrupt workbook.
 */
export const readXlsxRows = async (
  stream: Readable,
  limits?: XlsxLimits,
): Promise<string[][]> =>
  (await collectFirstWorksheet(stream, limits)).map((values) =>
    values.map(cellToText),
  )
```

- [ ] **Step 4: Create the tabular reader**

Create `packages/imports/src/parsers/tabular.ts`:

```ts
import { Readable } from "node:stream"
import { parse } from "csv-parse/sync"
import { readXlsxRows, XlsxLimitError } from "./xlsx"

export type TabularFormat = "csv" | "xlsx"
export type TabularFile = { headers: string[]; rows: string[][] }

export class TabularFileError extends Error {
  readonly reason: "empty" | "tooManyRows" | "invalid"

  constructor(reason: "empty" | "tooManyRows" | "invalid", message: string) {
    super(message)
    this.name = "TabularFileError"
    this.reason = reason
  }
}

const DELIMITERS = [",", ";", "\t"] as const
const BOM = "﻿"
const LINE_BREAK = /\r?\n/

/** Most frequent of `,` `;` tab in the header line; `,` on a tie or none. */
export function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  let best: "," | ";" | "\t" = ","
  let bestCount = 0
  for (const delimiter of DELIMITERS) {
    const count = headerLine.split(delimiter).length - 1
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

const isBlankRow = (row: string[]) => row.every((cell) => cell === "")

function toTable(raw: string[][], maxRows: number): TabularFile {
  const nonBlank = raw.filter((row) => !isBlankRow(row))
  const [headerRow, ...dataRows] = nonBlank
  if (!headerRow) {
    throw new TabularFileError("empty", "The file has no header row")
  }
  if (dataRows.length > maxRows) {
    throw new TabularFileError(
      "tooManyRows",
      `The file has more than ${maxRows} rows`,
    )
  }
  const width = headerRow.length
  return {
    headers: headerRow.map((header) => header.trim()),
    rows: dataRows.map((row) =>
      Array.from({ length: width }, (_, index) => row[index] ?? ""),
    ),
  }
}

function readCsv(buffer: Buffer, maxRows: number): TabularFile {
  let text = buffer.toString("utf8")
  if (text.startsWith(BOM)) {
    text = text.slice(1)
  }
  const headerLine = text.split(LINE_BREAK, 1)[0] ?? ""
  let raw: string[][]
  try {
    raw = parse(text, {
      delimiter: detectDelimiter(headerLine),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as string[][]
  } catch (error) {
    throw new TabularFileError(
      "invalid",
      error instanceof Error ? error.message : "Invalid CSV file",
    )
  }
  return toTable(raw, maxRows)
}

async function readXlsx(
  buffer: Buffer,
  maxRows: number,
  maxBytes: number,
): Promise<TabularFile> {
  let raw: string[][]
  try {
    raw = await readXlsxRows(Readable.from(buffer), {
      maxRows,
      maxCompressedBytes: maxBytes,
    })
  } catch (error) {
    if (error instanceof XlsxLimitError && error.kind === "rows") {
      throw new TabularFileError("tooManyRows", error.message)
    }
    throw new TabularFileError(
      "invalid",
      error instanceof Error ? error.message : "Invalid XLSX file",
    )
  }
  return toTable(raw, maxRows)
}

/**
 * Whole-file, in-memory read of a small tabular upload into header + string
 * rows. Blank rows are dropped and short rows are padded to the header width.
 * For row-streaming imports use `createImportRowParser` instead.
 */
export async function readTabularFile(input: {
  format: TabularFormat
  buffer: Buffer
  maxRows: number
  maxBytes: number
}): Promise<TabularFile> {
  if (input.buffer.length === 0) {
    throw new TabularFileError("empty", "The file is empty")
  }
  if (input.buffer.length > input.maxBytes) {
    throw new TabularFileError("invalid", "The file is too large")
  }
  return input.format === "csv"
    ? readCsv(input.buffer, input.maxRows)
    : await readXlsx(input.buffer, input.maxRows, input.maxBytes)
}
```

Then in `packages/imports/src/parsers/index.ts` add to the export list:

```ts
export {
  detectDelimiter,
  readTabularFile,
  type TabularFile,
  TabularFileError,
  type TabularFormat,
} from "./tabular"
```

and extend the existing xlsx export with `readXlsxRows, XlsxLimitError, type XlsxLimits`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @chatbotx.io/imports test`
Expected: PASS — new `tabular.test.ts` plus the existing `xlsx-parser.test.ts` (default caps and messages unchanged).

- [ ] **Step 6: Type-check and commit**

```bash
pnpm --filter @chatbotx.io/imports check-types
git add packages/imports/src/parsers/xlsx.ts packages/imports/src/parsers/tabular.ts packages/imports/src/parsers/index.ts packages/imports/__tests__/tabular.test.ts
git commit -m "feat(imports): add in-memory tabular file reader with configurable xlsx caps"
```

---

### Task 2: Customer-file normalizers

**Files:**
- Create: `integrations/facebook-ads/src/customer-file/keys.ts`
- Create: `integrations/facebook-ads/src/customer-file/normalizers.ts`
- Test: `integrations/facebook-ads/__tests__/customer-file-normalizers.test.ts`

**Interfaces:**
- Consumes: `normalizePhoneNumber(phone: string, country?: string | null, fallbackCountry?: string | null): string | null` from `src/apis/audience-users.ts`.
- Produces (`keys.ts`):
  - `export const CUSTOMER_FILE_KEYS = ["EMAIL","PHONE","FN","LN","CT","ST","ZIP","COUNTRY","DOBY","DOBM","DOBD","GEN","MADID"] as const`
  - `export type CustomerFileKey = (typeof CUSTOMER_FILE_KEYS)[number]`
  - `export type CustomerFileColumn = "EMAIL"|"PHONE"|"FN"|"LN"|"CT"|"ST"|"ZIP"|"COUNTRY"|"DOB"|"DOBY"|"GEN"|"MADID"`
- Produces (`normalizers.ts`), each returns `string | null` unless noted:
  `normalizeEmail(raw)`, `normalizeCustomerPhone(raw, country: string | null)`, `normalizeName(raw)`, `normalizeCity(raw)`, `normalizeState(raw)`, `normalizeZip(raw, country: string | null)`, `normalizeCountry(raw)`, `parseDateOfBirth(raw, now?: Date): { doby: string; dobm: string; dobd: string } | null`, `normalizeBirthYear(raw, now?: Date)`, `normalizeGender(raw)`, `normalizeMadid(raw)`.
  `country` arguments are already-normalized lowercase ISO codes (output of `normalizeCountry`).

- [ ] **Step 1: Write the failing test**

Create `integrations/facebook-ads/__tests__/customer-file-normalizers.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import {
  normalizeBirthYear,
  normalizeCity,
  normalizeCountry,
  normalizeCustomerPhone,
  normalizeEmail,
  normalizeGender,
  normalizeMadid,
  normalizeName,
  normalizeState,
  normalizeZip,
  parseDateOfBirth,
} from "../src/customer-file/normalizers"

const NOW = new Date("2026-10-04T00:00:00.000Z")

describe("normalizeEmail", () => {
  test("trims and lowercases", () => {
    expect(normalizeEmail("  ElizabethO@FB.com ")).toBe("elizabetho@fb.com")
  })
  test("rejects non-emails and blanks", () => {
    expect(normalizeEmail("not-an-email")).toBeNull()
    expect(normalizeEmail("   ")).toBeNull()
  })
})

describe("normalizeCustomerPhone", () => {
  test("uses the row country to parse a national number", () => {
    expect(normalizeCustomerPhone("1-(650)-561-5622", "us")).toBe("16505615622")
    expect(normalizeCustomerPhone("0912345678", "vn")).toBe("84912345678")
  })
  test("parses international numbers without a country", () => {
    expect(normalizeCustomerPhone("+44 303 123 7300", null)).toBe("443031237300")
    // Meta's own example from the Marketing Messages guide.
    expect(normalizeCustomerPhone("(+84) 091-2345678", null)).toBe("84912345678")
  })
  test("falls back to digits when the number has a calling code but no +", () => {
    expect(normalizeCustomerPhone("1-(650)-561-5622", null)).toBe("16505615622")
  })
  test("drops a local number with no country instead of guessing", () => {
    expect(normalizeCustomerPhone("0912345678", null)).toBeNull()
  })
  test("blank is null", () => {
    expect(normalizeCustomerPhone("  ", "us")).toBeNull()
  })
})

describe("names and places", () => {
  test("names: lowercase, strip punctuation and digits, keep Unicode letters", () => {
    expect(normalizeName("  O'Brien-Smith3 ")).toBe("obriensmith")
    expect(normalizeName("Nguyễn Văn")).toBe("nguyễn văn")
    expect(normalizeName("Mary   Ann")).toBe("mary ann")
    expect(normalizeName("!!!")).toBeNull()
  })
  test("city also removes whitespace", () => {
    expect(normalizeCity("Menlo Park")).toBe("menlopark")
    expect(normalizeCity("São Paulo")).toBe("sãopaulo")
  })
  test("state keeps letters only, lowercase", () => {
    expect(normalizeState("CA")).toBe("ca")
    expect(normalizeState(" N.Y. ")).toBe("ny")
  })
  test("zip: lowercase, no whitespace, US keeps 5 digits", () => {
    expect(normalizeZip("90001-4656", "us")).toBe("90001")
    expect(normalizeZip("90001-4656", null)).toBe("90001")
    expect(normalizeZip("SW1A 1AA", "gb")).toBe("sw1a1aa")
    expect(normalizeZip("", "us")).toBeNull()
  })
  test("country: 2-letter lowercase ISO only", () => {
    expect(normalizeCountry(" US ")).toBe("us")
    expect(normalizeCountry("USA")).toBeNull()
  })
})

describe("dates of birth", () => {
  test("MM/DD/YY pivots on the current year", () => {
    expect(parseDateOfBirth("10/21/68", NOW)).toEqual({
      doby: "1968",
      dobm: "10",
      dobd: "21",
    })
    expect(parseDateOfBirth("01/02/05", NOW)).toEqual({
      doby: "2005",
      dobm: "01",
      dobd: "02",
    })
  })
  test("MM/DD/YYYY and YYYY-MM-DD", () => {
    expect(parseDateOfBirth("9/1/1978", NOW)).toEqual({
      doby: "1978",
      dobm: "09",
      dobd: "01",
    })
    expect(parseDateOfBirth("1982-11-21", NOW)).toEqual({
      doby: "1982",
      dobm: "11",
      dobd: "21",
    })
  })
  test("invalid dates are null", () => {
    expect(parseDateOfBirth("02/30/1990", NOW)).toBeNull()
    expect(parseDateOfBirth("13/01/1990", NOW)).toBeNull()
    expect(parseDateOfBirth("1899-01-01", NOW)).toBeNull()
    expect(parseDateOfBirth("2030-01-01", NOW)).toBeNull()
    expect(parseDateOfBirth("yesterday", NOW)).toBeNull()
  })
  test("birth year: 4 digits between 1900 and now", () => {
    expect(normalizeBirthYear("1978", NOW)).toBe("1978")
    expect(normalizeBirthYear("78", NOW)).toBeNull()
    expect(normalizeBirthYear("2099", NOW)).toBeNull()
  })
})

describe("gender and madid", () => {
  test("gender maps to m/f", () => {
    expect(normalizeGender("F")).toBe("f")
    expect(normalizeGender("male")).toBe("m")
    expect(normalizeGender("x")).toBeNull()
  })
  test("madid lowercases and keeps hyphens", () => {
    expect(normalizeMadid(" BEBE52E7-03EE-455A-B3C4-E57283966239 ")).toBe(
      "bebe52e7-03ee-455a-b3c4-e57283966239",
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/integration-facebook-ads test -- customer-file-normalizers`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `integrations/facebook-ads/src/customer-file/keys.ts`:

```ts
/** Meta customer-file schema keys, in the order we always send them. */
export const CUSTOMER_FILE_KEYS = [
  "EMAIL",
  "PHONE",
  "FN",
  "LN",
  "CT",
  "ST",
  "ZIP",
  "COUNTRY",
  "DOBY",
  "DOBM",
  "DOBD",
  "GEN",
  "MADID",
] as const

export type CustomerFileKey = (typeof CUSTOMER_FILE_KEYS)[number]

/**
 * What a file column can map to. `DOB` is a full date that fans out into
 * DOBY/DOBM/DOBD; `DOBY` is a standalone year-of-birth column.
 */
export type CustomerFileColumn =
  | "EMAIL"
  | "PHONE"
  | "FN"
  | "LN"
  | "CT"
  | "ST"
  | "ZIP"
  | "COUNTRY"
  | "DOB"
  | "DOBY"
  | "GEN"
  | "MADID"
```

Create `integrations/facebook-ads/src/customer-file/normalizers.ts`:

```ts
import { normalizePhoneNumber } from "../apis/audience-users"

// Hoisted: Biome's useTopLevelRegex forbids regex literals inside functions.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NON_LETTER_OR_SPACE = /[^\p{L}\s]/gu
const NON_LETTER = /[^\p{L}]/gu
const WHITESPACE_RUN = /\s+/g
const WHITESPACE = /\s/g
const COUNTRY_PATTERN = /^[a-z]{2}$/
const US_ZIP_PREFIX = /^\d{5}/
const US_ZIP_PLUS_FOUR = /^(\d{5})-\d{4}$/
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/
const FOUR_DIGITS = /^\d{4}$/
const MIN_BIRTH_YEAR = 1900

const orNull = (value: string): string | null => (value ? value : null)

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return EMAIL_PATTERN.test(value) ? value : null
}

/**
 * Prefers a libphonenumber parse with the row's country (via the existing
 * `normalizePhoneNumber`), which also handles international `+` numbers with
 * no country. A local number (leading 0) with no country returns null rather
 * than hashing a guessed identity.
 */
export function normalizeCustomerPhone(
  raw: string,
  country: string | null,
): string | null {
  const value = raw.trim()
  if (!value) {
    return null
  }
  return normalizePhoneNumber(value, country ? country.toUpperCase() : null)
}

export function normalizeName(raw: string): string | null {
  return orNull(
    raw
      .normalize("NFC")
      .toLowerCase()
      .replace(NON_LETTER_OR_SPACE, "")
      .replace(WHITESPACE_RUN, " ")
      .trim(),
  )
}

export function normalizeCity(raw: string): string | null {
  return orNull((normalizeName(raw) ?? "").replace(WHITESPACE, ""))
}

export function normalizeState(raw: string): string | null {
  return orNull(raw.normalize("NFC").toLowerCase().replace(NON_LETTER, ""))
}

export function normalizeZip(raw: string, country: string | null): string | null {
  const value = raw.toLowerCase().replace(WHITESPACE, "")
  const plusFour = US_ZIP_PLUS_FOUR.exec(value)
  if (plusFour?.[1]) {
    return plusFour[1]
  }
  if (country === "us") {
    return US_ZIP_PREFIX.exec(value)?.[0] ?? null
  }
  return orNull(value)
}

export function normalizeCountry(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return COUNTRY_PATTERN.test(value) ? value : null
}

const pad2 = (value: number) => String(value).padStart(2, "0")

function toDob(
  year: number,
  month: number,
  day: number,
  now: Date,
): { doby: string; dobm: string; dobd: string } | null {
  if (year < MIN_BIRTH_YEAR || year > now.getUTCFullYear()) {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { doby: String(year), dobm: pad2(month), dobd: pad2(day) }
}

/**
 * Accepts `YYYY-MM-DD`, `MM/DD/YYYY`, `MM/DD/YY`. A 2-digit year greater than
 * the current 2-digit year is 19xx, otherwise 20xx (spec D22).
 */
export function parseDateOfBirth(
  raw: string,
  now: Date = new Date(),
): { doby: string; dobm: string; dobd: string } | null {
  const value = raw.trim()
  const iso = ISO_DATE.exec(value)
  if (iso) {
    return toDob(Number(iso[1]), Number(iso[2]), Number(iso[3]), now)
  }
  const us = US_DATE.exec(value)
  if (!us) {
    return null
  }
  const yearText = us[3] ?? ""
  let year = Number(yearText)
  if (yearText.length === 2) {
    year += year > now.getUTCFullYear() % 100 ? 1900 : 2000
  }
  return toDob(year, Number(us[1]), Number(us[2]), now)
}

export function normalizeBirthYear(
  raw: string,
  now: Date = new Date(),
): string | null {
  const value = raw.trim()
  if (!FOUR_DIGITS.test(value)) {
    return null
  }
  const year = Number(value)
  return year >= MIN_BIRTH_YEAR && year <= now.getUTCFullYear() ? value : null
}

export function normalizeGender(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  if (value === "m" || value === "male") {
    return "m"
  }
  if (value === "f" || value === "female") {
    return "f"
  }
  return null
}

export function normalizeMadid(raw: string): string | null {
  return orNull(raw.trim().toLowerCase())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @chatbotx.io/integration-facebook-ads test -- customer-file-normalizers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add integrations/facebook-ads/src/customer-file/keys.ts integrations/facebook-ads/src/customer-file/normalizers.ts integrations/facebook-ads/__tests__/customer-file-normalizers.test.ts
git commit -m "feat(facebook-ads): add customer-file identifier normalizers"
```

---

### Task 3: Header mapping, hashed payload builder, and template file

**Files:**
- Create: `integrations/facebook-ads/src/customer-file/header-map.ts`
- Create: `integrations/facebook-ads/src/customer-file/build-payload.ts`
- Create: `integrations/facebook-ads/src/customer-file/index.ts`
- Modify: `integrations/facebook-ads/package.json` (exports)
- Create: `apps/builder/public/templates/marketing-messages-audience.csv`
- Test: `integrations/facebook-ads/__tests__/customer-file-payload.test.ts`

**Interfaces:**
- Consumes: Task 2 keys + normalizers.
- Produces:
  - `export type CustomerFileColumnMap = Map<CustomerFileColumn, number>` (column → first matching header index)
  - `export type HeaderMapResult = { ok: true; columns: CustomerFileColumnMap } | { ok: false; reason: "noIdentifier" }`
  - `export function mapCustomerFileHeaders(headers: string[]): HeaderMapResult`
  - `export type CustomerFilePayload = { schema: CustomerFileKey[]; data: string[][]; skipped: number }`
  - `export function buildCustomerFilePayload(rows: string[][], columns: CustomerFileColumnMap, now?: Date): CustomerFilePayload`
  - Package export: `@chatbotx.io/integration-facebook-ads/customer-file` re-exporting keys, normalizers, header-map, build-payload. **Not** re-exported from `src/index.ts` (D25).

- [ ] **Step 1: Create the template file**

Create `apps/builder/public/templates/marketing-messages-audience.csv` (the user's `~/Downloads/example_audience_file.csv` with the `age` and `uid` columns removed, D20):

```csv
email,phone,madid,fn,ln,zip,ct,st,country,dob,doby,gen
elizabetho@fb.com,1-(650)-561-5622,aece52e7-03ee-455a-b3c4-e57283966239,Elizabeth,Olsen,94046,Menlo Park,CA,US,10/21/68,1968,F
andrewj@fb.com,1-(212) 736-3100,BEBE52E7-03EE-455A-B3C4-E57283966239,Andrew,Jamison,10118,New York,NY,US,10/17/78,1978,M
margaretj@fb.com,1-(323) 857-6000,adbe52e7-03ee-455a-b3c4-e57283966239,Margaret,Johnson,90001-4656,Los Angeles,CA,US,11/21/82,1982,F
johnd@fb.com,1-(312) 443-3600,aebe52e7-03ee-455a-b3c4-e57283966239,John,Doe,60603,Chicago,IL,US,09/01/78,1978,M
marks@fb.com,+44 303 123 7300,AEBD52E7-03EE-455A-B3C4-E57283966239,Mark,Smith,SW1A 1AA,London,,GB,12/10/78,1978,M
jamesm@fb.com,+44 20 7219 4272,aece52e7-03ee-455a-b3c4-e57283966239,James,McLaughlin,SW1A 1AA,London,,GB,10/21/56,1978,M
pauloa@fb.com,+55 21 3938-6900,ACBE52E7-03EE-455A-B3C4-E57283966239,Paulo,Alessandro,01310-200,Sao Paulo,,BR,12/21/78,1976,M
mariel@fb.com,+33 892 70 12 39,AFCE52E7-03EE-455A-B3C4-E57283966239,Marie,Laurent,75007,Paris,,FR,10/10/65,1978,F
thomasd@fb.com,+33 892 70 12 39,AEBE52E7-03EE-455A-B3C4-E57283966239,Thomas,Dubois,75007,Paris,,FR,11/19/72,1978,M
```

- [ ] **Step 2: Write the failing test**

Create `integrations/facebook-ads/__tests__/customer-file-payload.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  buildCustomerFilePayload,
  mapCustomerFileHeaders,
} from "../src/customer-file"

const NOW = new Date("2026-10-04T00:00:00.000Z")
const TEMPLATE = join(
  __dirname,
  "../../../apps/builder/public/templates/marketing-messages-audience.csv",
)

// Known SHA-256 hex vectors.
const H = {
  email: "23b9cb38c8e9c75a466a349eec16aff2c3eabc707cf57432a872aab7e532d069", // elizabetho@fb.com
  phone: "c7e1a5948418c64b472abbe6a7b443ec83c4e31573874d600de828f89dd71339", // 16505615622
  fn: "b54f08623ae4039f55bcecba4961037fb4513d2ba9cb2b0667c5db970ac94911", // elizabeth
  ct: "0007a3d64c01e23d5075203c5977c14e4f7e01a3fc570686fcc50b5e1dd42685", // menlopark
  st: "6959097001d10501ac7d54c0bdb8db61420f658f2922cc26e46d536119a31126", // ca
  zip: "295d89c851231ecef8c875c88077773f861c5adb0b0e239933dd5241d230dbd9", // 94046
  country: "79adb2a2fce5c6ba215fe5f27f532d4e7edbac4b6a5e09e1ef3a08084a904621", // us
  doby: "a48622b535728587fd351763d1296c7ec9cb5bc6743d5f22b011d5b5c3ef688f", // 1968
  dobm: "4a44dc15364204a80fe80e9039455cc1608281820fe2b24f1e5233ade6af1dd5", // 10
  dobd: "6f4b6612125fb3a0daecd2799dfd6c9c299424fd920f9b308110a2c1fbd8f443", // 21
  gen: "252f10c83610ebca1a059c0bae8255eba2f95be4d1d7bcfa89d7248a82d9f111", // f
}

function mapOrThrow(headers: string[]) {
  const result = mapCustomerFileHeaders(headers)
  if (!result.ok) {
    throw new Error(result.reason)
  }
  return result.columns
}

describe("mapCustomerFileHeaders", () => {
  test("matches template names and aliases case/space/underscore-insensitively", () => {
    const columns = mapOrThrow([
      "E-mail",
      "Phone Number",
      "First_Name",
      "last name",
      "City",
      "State/Province",
      "ZIP/Postal Code",
      "Country",
      "Date of birth",
      "Year of birth",
      "Gender",
      "Mobile advertiser ID",
      "age",
    ])
    expect([...columns.entries()]).toEqual([
      ["EMAIL", 0],
      ["PHONE", 1],
      ["FN", 2],
      ["LN", 3],
      ["CT", 4],
      ["ST", 5],
      ["ZIP", 6],
      ["COUNTRY", 7],
      ["DOB", 8],
      ["DOBY", 9],
      ["GEN", 10],
      ["MADID", 11],
    ])
  })

  test("first duplicate column wins", () => {
    expect(mapOrThrow(["email", "Email"]).get("EMAIL")).toBe(0)
  })

  test("needs an email or phone column", () => {
    expect(mapCustomerFileHeaders(["fn", "ln", "uid"])).toEqual({
      ok: false,
      reason: "noIdentifier",
    })
  })
})

describe("buildCustomerFilePayload", () => {
  test("builds the canonical schema and hashes every value except MADID", () => {
    const columns = mapOrThrow([
      "email", "phone", "madid", "fn", "ln", "zip", "ct", "st", "country", "dob", "doby", "gen",
    ])
    const payload = buildCustomerFilePayload(
      [[
        "elizabetho@fb.com", "1-(650)-561-5622", "AECE52E7-03EE-455A-B3C4-E57283966239",
        "Elizabeth", "", "94046", "Menlo Park", "CA", "US", "10/21/68", "", "F",
      ]],
      columns,
      NOW,
    )
    expect(payload.schema).toEqual([
      "EMAIL", "PHONE", "FN", "LN", "CT", "ST", "ZIP", "COUNTRY", "DOBY", "DOBM", "DOBD", "GEN", "MADID",
    ])
    expect(payload.data).toEqual([[
      H.email, H.phone, H.fn, "", H.ct, H.st, H.zip, H.country, H.doby, H.dobm, H.dobd, H.gen,
      "aece52e7-03ee-455a-b3c4-e57283966239",
    ]])
    expect(payload.skipped).toBe(0)
  })

  test("an explicit year-of-birth column wins over the DOB year", () => {
    const columns = mapOrThrow(["email", "dob", "doby"])
    const payload = buildCustomerFilePayload(
      [["elizabetho@fb.com", "10/21/67", "1968"]],
      columns,
      NOW,
    )
    expect(payload.data[0]?.[1]).toBe(H.doby)
  })

  test("only sends keys present in the headers", () => {
    const payload = buildCustomerFilePayload(
      [["elizabetho@fb.com"]],
      mapOrThrow(["email"]),
      NOW,
    )
    expect(payload).toEqual({ schema: ["EMAIL"], data: [[H.email]], skipped: 0 })
  })

  test("skips rows with neither a valid email nor a valid phone", () => {
    const payload = buildCustomerFilePayload(
      [
        ["not-an-email", "0912345678", "Ann"], // local phone, no country → invalid
        ["", "", "Bob"],
        ["elizabetho@fb.com", "", ""],
      ],
      mapOrThrow(["email", "phone", "fn"]),
      NOW,
    )
    expect(payload.skipped).toBe(2)
    expect(payload.data).toEqual([[H.email, "", ""]])
  })

  test("the shipped template produces 9 rows and the full schema", () => {
    const [headerLine, ...lines] = readFileSync(TEMPLATE, "utf8").trim().split("\n")
    // The template has no quoted cells, so a plain split is exact.
    const rows = lines.map((line) => line.split(","))
    const payload = buildCustomerFilePayload(
      rows,
      mapOrThrow((headerLine ?? "").split(",")),
      NOW,
    )
    expect(payload.skipped).toBe(0)
    expect(payload.data).toHaveLength(9)
    expect(payload.schema).toHaveLength(13)
    expect(payload.data[0]?.[0]).toBe(H.email)
    expect(payload.data[0]?.[1]).toBe(H.phone)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/integration-facebook-ads test -- customer-file-payload`
Expected: FAIL — `../src/customer-file` has no index.

- [ ] **Step 4: Write the implementation**

Create `integrations/facebook-ads/src/customer-file/header-map.ts`:

```ts
import type { CustomerFileColumn } from "./keys"

export type CustomerFileColumnMap = Map<CustomerFileColumn, number>

export type HeaderMapResult =
  | { ok: true; columns: CustomerFileColumnMap }
  | { ok: false; reason: "noIdentifier" }

const HEADER_NOISE = /[\s_\-/]/g

/** Keys are headers lowercased with spaces, `_`, `-` and `/` removed. */
const HEADER_ALIASES: Record<string, CustomerFileColumn> = {
  email: "EMAIL",
  phone: "PHONE",
  phonenumber: "PHONE",
  fn: "FN",
  firstname: "FN",
  ln: "LN",
  lastname: "LN",
  ct: "CT",
  city: "CT",
  st: "ST",
  state: "ST",
  province: "ST",
  stateprovince: "ST",
  zip: "ZIP",
  zipcode: "ZIP",
  postalcode: "ZIP",
  zippostalcode: "ZIP",
  country: "COUNTRY",
  dob: "DOB",
  dateofbirth: "DOB",
  doby: "DOBY",
  yearofbirth: "DOBY",
  gen: "GEN",
  gender: "GEN",
  madid: "MADID",
  mobileadvertiserid: "MADID",
}

/** Unknown columns are ignored; for duplicates the first column wins. */
export function mapCustomerFileHeaders(headers: string[]): HeaderMapResult {
  const columns: CustomerFileColumnMap = new Map()
  headers.forEach((header, index) => {
    const column =
      HEADER_ALIASES[header.trim().toLowerCase().replace(HEADER_NOISE, "")]
    if (column && !columns.has(column)) {
      columns.set(column, index)
    }
  })
  if (!(columns.has("EMAIL") || columns.has("PHONE"))) {
    return { ok: false, reason: "noIdentifier" }
  }
  return { ok: true, columns }
}
```

Create `integrations/facebook-ads/src/customer-file/build-payload.ts`:

```ts
// node:crypto (sync) on purpose — 100k rows × 13 keys through async Web
// Crypto is far too slow. This module is only reachable through the
// `./customer-file` package export, never the package root, so the builder's
// edge/middleware graph never pulls it in (spec D25).
import { createHash } from "node:crypto"
import type { CustomerFileColumnMap } from "./header-map"
import { CUSTOMER_FILE_KEYS, type CustomerFileKey } from "./keys"
import {
  normalizeBirthYear,
  normalizeCity,
  normalizeCountry,
  normalizeCustomerPhone,
  normalizeEmail,
  normalizeGender,
  normalizeMadid,
  normalizeName,
  normalizeState,
  normalizeZip,
  parseDateOfBirth,
} from "./normalizers"

export type CustomerFilePayload = {
  schema: CustomerFileKey[]
  data: string[][]
  skipped: number
}

const sha256Hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex")

function keyIsPresent(key: CustomerFileKey, columns: CustomerFileColumnMap) {
  switch (key) {
    case "DOBY":
      return columns.has("DOB") || columns.has("DOBY")
    case "DOBM":
    case "DOBD":
      return columns.has("DOB")
    default:
      return columns.has(key)
  }
}

function normalizeRow(
  row: string[],
  columns: CustomerFileColumnMap,
  now: Date,
): Partial<Record<CustomerFileKey, string | null>> {
  const cell = (column: Parameters<CustomerFileColumnMap["get"]>[0]) => {
    const index = columns.get(column)
    return index === undefined ? "" : (row[index] ?? "").trim()
  }
  const country = normalizeCountry(cell("COUNTRY"))
  const dob = parseDateOfBirth(cell("DOB"), now)
  return {
    EMAIL: normalizeEmail(cell("EMAIL")),
    PHONE: normalizeCustomerPhone(cell("PHONE"), country),
    FN: normalizeName(cell("FN")),
    LN: normalizeName(cell("LN")),
    CT: normalizeCity(cell("CT")),
    ST: normalizeState(cell("ST")),
    ZIP: normalizeZip(cell("ZIP"), country),
    COUNTRY: country,
    DOBY: normalizeBirthYear(cell("DOBY"), now) ?? dob?.doby ?? null,
    DOBM: dob?.dobm ?? null,
    DOBD: dob?.dobd ?? null,
    GEN: normalizeGender(cell("GEN")),
    MADID: normalizeMadid(cell("MADID")),
  }
}

/**
 * Normalize + hash a whole file. The schema is the canonical key order
 * filtered to what the headers provide, identical for every batch (Meta
 * requires a constant schema within a session). Rows without a valid EMAIL or
 * PHONE are counted in `skipped` and not emitted.
 */
export function buildCustomerFilePayload(
  rows: string[][],
  columns: CustomerFileColumnMap,
  now: Date = new Date(),
): CustomerFilePayload {
  const schema = CUSTOMER_FILE_KEYS.filter((key) => keyIsPresent(key, columns))
  const data: string[][] = []
  let skipped = 0

  for (const row of rows) {
    const values = normalizeRow(row, columns, now)
    if (!(values.EMAIL || values.PHONE)) {
      skipped += 1
      continue
    }
    data.push(
      schema.map((key) => {
        const value = values[key]
        if (!value) {
          return ""
        }
        return key === "MADID" ? value : sha256Hex(value)
      }),
    )
  }

  return { schema, data, skipped }
}
```

Create `integrations/facebook-ads/src/customer-file/index.ts`:

```ts
export * from "./build-payload"
export * from "./header-map"
export * from "./keys"
export * from "./normalizers"
```

In `integrations/facebook-ads/package.json`, add to `"exports"` (after `"./apis/*"`):

```json
    "./customer-file": "./src/customer-file/index.ts",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @chatbotx.io/integration-facebook-ads test -- customer-file`
Expected: PASS (both customer-file test files).

- [ ] **Step 6: Type-check and commit**

```bash
pnpm --filter @chatbotx.io/integration-facebook-ads check-types
git add integrations/facebook-ads/src/customer-file/header-map.ts integrations/facebook-ads/src/customer-file/build-payload.ts integrations/facebook-ads/src/customer-file/index.ts integrations/facebook-ads/package.json integrations/facebook-ads/__tests__/customer-file-payload.test.ts apps/builder/public/templates/marketing-messages-audience.csv
git commit -m "feat(facebook-ads): build hashed customer-file payloads from uploaded columns"
```

---

### Task 4: Graph API calls for Marketing Messages audiences

**Files:**
- Create: `integrations/facebook-ads/src/apis/marketing-messages-audiences.ts`
- Modify: `integrations/facebook-ads/src/apis/ad-accounts.ts` (export `fetchAllPages`)
- Modify: `integrations/facebook-ads/src/index.ts`
- Test: `integrations/facebook-ads/__tests__/marketing-messages-audiences.test.ts`

**Interfaces:**
- Consumes: `facebookAdsGraphClient`, `rescue`, `FacebookAdsException`, `DEFAULT_API_VERSION`, `ADS_PAGE_LIMIT`, `fetchAllPages`.
- Produces:
  - `export const MARKETING_MESSAGES_AUDIENCE_SUBTYPE = 1010`
  - `export const AUDIENCE_UPLOAD_BATCH_SIZE = 10_000`
  - `export function createMarketingMessagesAudience(input: { accessToken: string; adAccountId: string; pageId: string; name: string; description?: string | null; version?: string }): Promise<{ id: string }>`
  - `export class AudienceUploadError extends Error { readonly received: number; readonly invalid: number }`
  - `export function uploadAudienceUsersSession(input: { accessToken: string; customAudienceId: string; schema: readonly string[]; data: string[][]; version?: string; sessionId?: number }): Promise<{ received: number; invalid: number }>`
  - `export type MarketingMessagesAudienceStatus = { code: number; description: string }`
  - `export type MarketingMessagesAudience = { id: string; name: string; description: string | null; deliveryStatus: MarketingMessagesAudienceStatus | null; operationStatus: MarketingMessagesAudienceStatus | null; approximateCountLowerBound: number | null; approximateCountUpperBound: number | null; pageId: string | null }`
  - `export function getMarketingMessagesAudiences(input: { accessToken: string; adAccountId: string; version?: string }): Promise<MarketingMessagesAudience[]>`
  - `export function deleteCustomAudience(input: { accessToken: string; customAudienceId: string; version?: string }): Promise<{ status: "deleted" | "notFound" }>`
  - `export function getNotificationMessageTokenAudienceIds(input: { pageAccessToken: string; pageId: string; customAudienceId: string; version?: string }): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

Create `integrations/facebook-ads/__tests__/marketing-messages-audiences.test.ts`:

```ts
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  AudienceUploadError,
  createMarketingMessagesAudience,
  deleteCustomAudience,
  getMarketingMessagesAudiences,
  getNotificationMessageTokenAudienceIds,
  uploadAudienceUsersSession,
} from "../src/apis/marketing-messages-audiences"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = `https://graph.facebook.com/${DEFAULT_API_VERSION}`

describe("createMarketingMessagesAudience", () => {
  test("sends the Marketing Messages audience body", async () => {
    let body: unknown
    server.use(
      http.post(`${BASE}/act_9/customaudiences`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: "aud_1" })
      }),
    )
    await expect(
      createMarketingMessagesAudience({
        accessToken: "T",
        adAccountId: "act_9",
        pageId: "page_1",
        name: "VIP",
        description: "desc",
      }),
    ).resolves.toEqual({ id: "aud_1" })
    expect(body).toEqual({
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
      name: "VIP",
      description: "desc",
      use_for_products: ["MARKETING_MESSAGES"],
      subscription_info: ["MESSENGER"],
      marketing_message_channels: { MESSENGER: "page_1" },
    })
  })

  test("accepts the { data: [{ id }] } shape shown in Meta's guide", async () => {
    server.use(
      http.post(`${BASE}/act_9/customaudiences`, () =>
        HttpResponse.json({ data: [{ id: "aud_2" }] }),
      ),
    )
    await expect(
      createMarketingMessagesAudience({
        accessToken: "T",
        adAccountId: "act_9",
        pageId: "p",
        name: "n",
      }),
    ).resolves.toEqual({ id: "aud_2" })
  })
})

describe("uploadAudienceUsersSession", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => [`h${i}`])

  test("splits into 10k batches inside one session", async () => {
    const bodies: Array<{
      payload: { schema: string[]; data: string[][] }
      session: Record<string, unknown>
    }> = []
    server.use(
      http.post(`${BASE}/aud_1/users`, async ({ request }) => {
        const body = (await request.json()) as (typeof bodies)[number]
        bodies.push(body)
        return HttpResponse.json({
          num_received: body.payload.data.length,
          num_invalid_entries: 1,
        })
      }),
    )
    await expect(
      uploadAudienceUsersSession({
        accessToken: "T",
        customAudienceId: "aud_1",
        schema: ["EMAIL"],
        data: rows(25_000),
        sessionId: 42,
      }),
    ).resolves.toEqual({ received: 25_000, invalid: 3 })
    expect(bodies.map((b) => b.payload.data.length)).toEqual([10_000, 10_000, 5000])
    expect(bodies.map((b) => b.session)).toEqual([
      { session_id: 42, batch_seq: 1, last_batch_flag: false, estimated_num_total: 25_000 },
      { session_id: 42, batch_seq: 2, last_batch_flag: false, estimated_num_total: 25_000 },
      { session_id: 42, batch_seq: 3, last_batch_flag: true, estimated_num_total: 25_000 },
    ])
    expect(bodies.every((b) => b.payload.schema[0] === "EMAIL")).toBe(true)
  })

  test("a failing batch throws AudienceUploadError with the totals so far", async () => {
    let call = 0
    server.use(
      http.post(`${BASE}/aud_1/users`, () => {
        call += 1
        if (call === 2) {
          return HttpResponse.json(
            { error: { code: 2650, message: "Failed to update the custom audience" } },
            { status: 400 },
          )
        }
        return HttpResponse.json({ num_received: 10_000, num_invalid_entries: 0 })
      }),
    )
    const error = await uploadAudienceUsersSession({
      accessToken: "T",
      customAudienceId: "aud_1",
      schema: ["EMAIL"],
      data: rows(25_000),
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AudienceUploadError)
    expect(error).toMatchObject({ received: 10_000, invalid: 0 })
  })
})

describe("getMarketingMessagesAudiences", () => {
  test("filters by subtype 1010 and maps fields", async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${BASE}/act_9/customaudiences`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json({
          data: [
            {
              id: "aud_1",
              name: "VIP",
              description: "d",
              delivery_status: { code: 300, description: "Audience too small" },
              operation_status: { code: 200, description: "Normal" },
              approximate_count_lower_bound: 1000,
              approximate_count_upper_bound: 1200,
              messenger_marketing_messages_page: { id: "page_1" },
            },
            { id: "aud_2", name: "Empty" },
          ],
        })
      }),
    )
    const result = await getMarketingMessagesAudiences({
      accessToken: "T",
      adAccountId: "act_9",
    })
    expect(JSON.parse(params?.get("filtering") ?? "[]")).toEqual([
      { field: "data_source.subtype", operator: "IN", value: [1010] },
    ])
    expect(params?.get("fields")).toContain("approximate_count_lower_bound")
    expect(result).toEqual([
      {
        id: "aud_1",
        name: "VIP",
        description: "d",
        deliveryStatus: { code: 300, description: "Audience too small" },
        operationStatus: { code: 200, description: "Normal" },
        approximateCountLowerBound: 1000,
        approximateCountUpperBound: 1200,
        pageId: "page_1",
      },
      {
        id: "aud_2",
        name: "Empty",
        description: null,
        deliveryStatus: null,
        operationStatus: null,
        approximateCountLowerBound: null,
        approximateCountUpperBound: null,
        pageId: null,
      },
    ])
  })
})

describe("deleteCustomAudience", () => {
  test("deleted", async () => {
    server.use(
      http.delete(`${BASE}/aud_1`, () => HttpResponse.json({ success: true })),
    )
    await expect(
      deleteCustomAudience({ accessToken: "T", customAudienceId: "aud_1" }),
    ).resolves.toEqual({ status: "deleted" })
  })

  test("Graph 100/33 (object does not exist) is notFound", async () => {
    server.use(
      http.delete(`${BASE}/aud_1`, () =>
        HttpResponse.json(
          { error: { code: 100, error_subcode: 33, message: "Unsupported delete request" } },
          { status: 400 },
        ),
      ),
    )
    await expect(
      deleteCustomAudience({ accessToken: "T", customAudienceId: "aud_1" }),
    ).resolves.toEqual({ status: "notFound" })
  })

  test("other errors throw", async () => {
    server.use(
      http.delete(`${BASE}/aud_1`, () =>
        HttpResponse.json({ error: { code: 200, message: "Permissions error" } }, { status: 403 }),
      ),
    )
    await expect(
      deleteCustomAudience({ accessToken: "T", customAudienceId: "aud_1" }),
    ).rejects.toThrow()
  })
})

describe("getNotificationMessageTokenAudienceIds", () => {
  test("returns custom_audience_ids of the first token as strings", async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${BASE}/page_1/notification_message_tokens`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json({
          data: [{ token: "x", custom_audience_ids: [123, "aud_1"] }],
        })
      }),
    )
    await expect(
      getNotificationMessageTokenAudienceIds({
        pageAccessToken: "PAGE",
        pageId: "page_1",
        customAudienceId: "aud_1",
      }),
    ).resolves.toEqual(["123", "aud_1"])
    expect(params?.get("custom_audience_ids")).toBe("aud_1")
    expect(params?.get("limit")).toBe("1")
    expect(params?.get("access_token")).toBe("PAGE")
  })

  test("no tokens yet is an empty list", async () => {
    server.use(
      http.get(`${BASE}/page_1/notification_message_tokens`, () =>
        HttpResponse.json({ data: [] }),
      ),
    )
    await expect(
      getNotificationMessageTokenAudienceIds({
        pageAccessToken: "PAGE",
        pageId: "page_1",
        customAudienceId: "aud_1",
      }),
    ).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/integration-facebook-ads test -- marketing-messages-audiences`
Expected: FAIL — module not found.

- [ ] **Step 3: Export `fetchAllPages`**

In `integrations/facebook-ads/src/apis/ad-accounts.ts`, change `async function fetchAllPages<T>(` to `export async function fetchAllPages<T>(`. Nothing else changes.

- [ ] **Step 4: Write the implementation**

Create `integrations/facebook-ads/src/apis/marketing-messages-audiences.ts`:

```ts
import { z } from "zod"
import { ADS_PAGE_LIMIT, DEFAULT_API_VERSION } from "../constants"
import { FacebookAdsException, rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { fetchAllPages } from "./ad-accounts"

/** `data_source.subtype` of a Messenger Marketing Messages audience. */
export const MARKETING_MESSAGES_AUDIENCE_SUBTYPE = 1010
/** Meta's per-request cap for `/{audience}/users`. */
export const AUDIENCE_UPLOAD_BATCH_SIZE = 10_000

// Graph's default create response is `{ id }`; the Marketing Messages guide
// shows `{ data: [{ id }] }`. Accept both (spec D26).
const createResponseSchema = z.union([
  z.object({ id: z.string().trim().min(1) }),
  z
    .object({ data: z.array(z.object({ id: z.string().trim().min(1) })).min(1) })
    .transform((value) => ({ id: value.data[0]?.id ?? "" })),
])

export function createMarketingMessagesAudience({
  accessToken,
  adAccountId,
  pageId,
  name,
  description,
  version = DEFAULT_API_VERSION,
}: {
  accessToken: string
  adAccountId: string
  pageId: string
  name: string
  description?: string | null
  version?: string
}): Promise<{ id: string }> {
  const endpoint = `${version}/${adAccountId}/customaudiences`
  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.post<unknown>(endpoint, {
      searchParams: { access_token: accessToken },
      json: {
        subtype: "CUSTOM",
        customer_file_source: "USER_PROVIDED_ONLY",
        name,
        ...(description ? { description } : {}),
        use_for_products: ["MARKETING_MESSAGES"],
        subscription_info: ["MESSENGER"],
        marketing_message_channels: { MESSENGER: pageId },
      },
    })
    return createResponseSchema.parse(response)
  })
}

/** A batch failed mid-session; carries what Meta accepted before it. */
export class AudienceUploadError extends Error {
  readonly received: number
  readonly invalid: number

  constructor(received: number, invalid: number, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Audience upload failed", {
      cause,
    })
    this.name = "AudienceUploadError"
    this.received = received
    this.invalid = invalid
  }
}

const uploadResponseSchema = z.object({
  num_received: z.number().optional(),
  num_invalid_entries: z.number().optional(),
})

// int64 on Meta's side, but JSON numbers are only exact to 2^53.
const randomSessionId = () =>
  Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1)) + 1

export async function uploadAudienceUsersSession({
  accessToken,
  customAudienceId,
  schema,
  data,
  version = DEFAULT_API_VERSION,
  sessionId = randomSessionId(),
}: {
  accessToken: string
  customAudienceId: string
  schema: readonly string[]
  data: string[][]
  version?: string
  sessionId?: number
}): Promise<{ received: number; invalid: number }> {
  const endpoint = `${version}/${customAudienceId}/users`
  const batchCount = Math.ceil(data.length / AUDIENCE_UPLOAD_BATCH_SIZE)
  let received = 0
  let invalid = 0

  for (let batch = 0; batch < batchCount; batch++) {
    const start = batch * AUDIENCE_UPLOAD_BATCH_SIZE
    try {
      const response = await rescue(endpoint, () =>
        facebookAdsGraphClient.post<unknown>(endpoint, {
          searchParams: { access_token: accessToken },
          json: {
            payload: {
              schema,
              data: data.slice(start, start + AUDIENCE_UPLOAD_BATCH_SIZE),
            },
            session: {
              session_id: sessionId,
              batch_seq: batch + 1,
              last_batch_flag: batch === batchCount - 1,
              estimated_num_total: data.length,
            },
          },
        }),
      )
      const parsed = uploadResponseSchema.parse(response)
      received += parsed.num_received ?? 0
      invalid += parsed.num_invalid_entries ?? 0
    } catch (error) {
      throw new AudienceUploadError(received, invalid, error)
    }
  }

  return { received, invalid }
}

export type MarketingMessagesAudienceStatus = {
  code: number
  description: string
}

export type MarketingMessagesAudience = {
  id: string
  name: string
  description: string | null
  deliveryStatus: MarketingMessagesAudienceStatus | null
  operationStatus: MarketingMessagesAudienceStatus | null
  approximateCountLowerBound: number | null
  approximateCountUpperBound: number | null
  pageId: string | null
}

type GraphAudience = {
  id: string
  name?: string
  description?: string
  delivery_status?: { code?: number; description?: string }
  operation_status?: { code?: number; description?: string }
  approximate_count_lower_bound?: number
  approximate_count_upper_bound?: number
  messenger_marketing_messages_page?: { id?: string } | null
}

const toStatus = (
  value?: { code?: number; description?: string },
): MarketingMessagesAudienceStatus | null =>
  typeof value?.code === "number"
    ? { code: value.code, description: value.description ?? "" }
    : null

export function getMarketingMessagesAudiences({
  accessToken,
  adAccountId,
  version = DEFAULT_API_VERSION,
}: {
  accessToken: string
  adAccountId: string
  version?: string
}): Promise<MarketingMessagesAudience[]> {
  const endpoint = `${version}/${adAccountId}/customaudiences`
  return rescue(endpoint, async () => {
    const rows = await fetchAllPages<GraphAudience>(endpoint, {
      fields:
        "id,name,subtype,description,delivery_status,operation_status,approximate_count_lower_bound,approximate_count_upper_bound,messenger_marketing_messages_page",
      filtering: JSON.stringify([
        {
          field: "data_source.subtype",
          operator: "IN",
          value: [MARKETING_MESSAGES_AUDIENCE_SUBTYPE],
        },
      ]),
      limit: String(ADS_PAGE_LIMIT),
      access_token: accessToken,
    })
    return rows.map((row) => ({
      id: row.id,
      name: row.name ?? row.id,
      description: row.description ?? null,
      deliveryStatus: toStatus(row.delivery_status),
      operationStatus: toStatus(row.operation_status),
      approximateCountLowerBound: row.approximate_count_lower_bound ?? null,
      approximateCountUpperBound: row.approximate_count_upper_bound ?? null,
      pageId: row.messenger_marketing_messages_page?.id ?? null,
    }))
  })
}

// Graph answers code 100 / subcode 33 for an object that no longer exists.
const isObjectMissing = (error: unknown) =>
  error instanceof FacebookAdsException &&
  error.code === 100 &&
  String(error.subCode) === "33"

export async function deleteCustomAudience({
  accessToken,
  customAudienceId,
  version = DEFAULT_API_VERSION,
}: {
  accessToken: string
  customAudienceId: string
  version?: string
}): Promise<{ status: "deleted" | "notFound" }> {
  const endpoint = `${version}/${customAudienceId}`
  try {
    await rescue(endpoint, () =>
      facebookAdsGraphClient.delete<unknown>(endpoint, {
        searchParams: { access_token: accessToken },
      }),
    )
    return { status: "deleted" }
  } catch (error) {
    if (isObjectMissing(error)) {
      return { status: "notFound" }
    }
    throw error
  }
}

const tokensResponseSchema = z.object({
  data: z
    .array(
      z.object({
        custom_audience_ids: z
          .array(z.union([z.string(), z.number()]))
          .optional(),
      }),
    )
    .default([]),
})

/**
 * Called as the Page (Page access token). Meta only returns tokens for an
 * audience once at least 100 users matched, so an empty list means "not
 * ready yet", not an error.
 */
export function getNotificationMessageTokenAudienceIds({
  pageAccessToken,
  pageId,
  customAudienceId,
  version = DEFAULT_API_VERSION,
}: {
  pageAccessToken: string
  pageId: string
  customAudienceId: string
  version?: string
}): Promise<string[]> {
  const endpoint = `${version}/${pageId}/notification_message_tokens`
  return rescue(endpoint, async () => {
    const response = await facebookAdsGraphClient.get<unknown>(endpoint, {
      searchParams: {
        custom_audience_ids: customAudienceId,
        limit: "1",
        access_token: pageAccessToken,
      },
    })
    const parsed = tokensResponseSchema.parse(response)
    return (parsed.data[0]?.custom_audience_ids ?? []).map(String)
  })
}
```

In `integrations/facebook-ads/src/index.ts` add (keep alphabetical with siblings):

```ts
export * from "./apis/marketing-messages-audiences"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @chatbotx.io/integration-facebook-ads test`
Expected: PASS — new file plus all existing tests (incl. `ad-accounts.test.ts`).

- [ ] **Step 6: Type-check and commit**

```bash
pnpm --filter @chatbotx.io/integration-facebook-ads check-types
git add integrations/facebook-ads/src/apis/marketing-messages-audiences.ts integrations/facebook-ads/src/apis/ad-accounts.ts integrations/facebook-ads/src/index.ts integrations/facebook-ads/__tests__/marketing-messages-audiences.test.ts
git commit -m "feat(facebook-ads): add marketing messages audience graph calls"
```

---

### Task 5: `FacebookMarketingMessageAudience` table, relations, repository, migration

**Files:**
- Create: `packages/database/src/schema/facebook-marketing-message-audience.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create: `packages/database/src/relations/facebook-marketing-message-audience.ts`
- Modify: `packages/database/src/relations/index.ts` (import **and** spread)
- Modify: `packages/database/src/types.ts`
- Create: `packages/database/src/repositories/facebook-marketing-messages/audience-repository.ts`
- Modify: `packages/database/src/repositories/facebook-marketing-messages/index.ts`
- Test: `packages/database/__tests__/facebook-marketing-message-audience-schema.test.ts`

**Interfaces:**
- Produces:
  - `facebookMarketingMessageAudienceModel` (table `"FacebookMarketingMessageAudience"`)
  - `export type FacebookMarketingMessageAudienceModel = typeof schema.facebookMarketingMessageAudienceModel.$inferSelect`
  - `facebookMarketingMessageAudienceRepository`:
    - `listByWorkspaceId(workspaceId, tx?): Promise<FacebookMarketingMessageAudienceModel[]>` (createdAt desc)
    - `findForWorkspace({ id, workspaceId }, tx?): Promise<FacebookMarketingMessageAudienceModel | null>`
    - `create(input: { id; workspaceId; customAudienceId; adAccountId; pageId; name; description: string | null; facebookUserId: string | null }, tx?): Promise<FacebookMarketingMessageAudienceModel>` — writes `rowsUploaded: 0` explicitly
    - `incrementRowsUploaded({ id, workspaceId, by }, tx?): Promise<void>`
    - `markReady({ ids, workspaceId, readyAt }, tx?): Promise<void>`
    - `remove({ id, workspaceId }, tx?): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `packages/database/__tests__/facebook-marketing-message-audience-schema.test.ts`:

```ts
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { facebookMarketingMessageAudienceModel } from "../src/schema"

describe("FacebookMarketingMessageAudience", () => {
  const config = getTableConfig(facebookMarketingMessageAudienceModel)

  test("is named FacebookMarketingMessageAudience", () => {
    expect(config.name).toBe("FacebookMarketingMessageAudience")
  })

  test("stores the Meta audience id uniquely so a retry cannot duplicate a row", () => {
    const unique = config.indexes.find(
      (index) =>
        index.config.name ===
        "FacebookMarketingMessageAudience_customAudienceId_key",
    )
    expect(unique?.config.unique).toBe(true)
  })

  test("indexes workspaceId", () => {
    expect(
      config.indexes.some(
        (index) =>
          index.config.name === "FacebookMarketingMessageAudience_workspaceId_idx",
      ),
    ).toBe(true)
  })

  test("has the columns the service relies on", () => {
    const columns = Object.fromEntries(
      config.columns.map((column) => [column.name, column]),
    )
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "workspaceId",
        "customAudienceId",
        "adAccountId",
        "pageId",
        "name",
        "description",
        "rowsUploaded",
        "readyAt",
        "facebookUserId",
      ]),
    )
    expect(columns.customAudienceId?.notNull).toBe(true)
    expect(columns.pageId?.notNull).toBe(true)
    expect(columns.description?.notNull).toBe(false)
    expect(columns.readyAt?.notNull).toBe(false)
    expect(columns.rowsUploaded?.notNull).toBe(true)
  })

  test("cascades on workspace delete", () => {
    const fk = config.foreignKeys[0]?.reference()
    expect(fk?.foreignTable).toBeDefined()
    expect(config.foreignKeys[0]?.onDelete).toBe("cascade")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/database test -- facebook-marketing-message-audience-schema`
Expected: FAIL — `facebookMarketingMessageAudienceModel` is not exported.

- [ ] **Step 3: Create the schema, relations, type, and registrations**

Create `packages/database/src/schema/facebook-marketing-message-audience.ts`:

```ts
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns, timestampConfig } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * One row = one Messenger Marketing Messages Custom Audience created through
 * ChatbotX. Inserted only after Meta returned the audience id, so
 * `customAudienceId` is never null.
 *
 * `pageId` is a RAW Meta Page id with no FK to `IntegrationMessenger` on
 * purpose (same as `FacebookMarketingMessage`): the audience lives on Meta and
 * must survive the workspace reconnecting the Page.
 *
 * Approximate count and delivery status are NOT stored — they are always read
 * live from Meta. `readyAt` is the one cached fact: once subscription tokens
 * exist for the audience the token check is never repeated.
 */
export const facebookMarketingMessageAudienceModel = pgTable(
  "FacebookMarketingMessageAudience",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    customAudienceId: text().notNull(),
    // `act_<id>` form, exactly as sent to Graph.
    adAccountId: text().notNull(),
    pageId: text().notNull(),
    name: text().notNull(),
    description: text(),
    // Sum of Meta's `num_received` across every upload. No DB default on
    // purpose — every insert writes 0 explicitly.
    rowsUploaded: integer().notNull(),
    readyAt: timestamp(timestampConfig),
    // App-Scoped User ID of the grant used at create time.
    facebookUserId: text(),
  },
  (table) => [
    index("FacebookMarketingMessageAudience_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("FacebookMarketingMessageAudience_customAudienceId_key").using(
      "btree",
      table.customAudienceId.asc().nullsLast(),
    ),
  ],
)
```

> If `timestampConfig` is not exported from `../partials/shared`, import it from wherever `facebook-marketing-messages-auth.ts` imports it (check that file's imports and mirror them exactly).

In `packages/database/src/schema/index.ts`, after `export * from "./facebook-marketing-message"`, add:

```ts
export * from "./facebook-marketing-message-audience"
```

Create `packages/database/src/relations/facebook-marketing-message-audience.ts`:

```ts
import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const facebookMarketingMessageAudienceRelations = defineRelationsPart(
  schema,
  (r) => ({
    facebookMarketingMessageAudienceModel: {
      workspace: r.one.workspaceModel({
        from: r.facebookMarketingMessageAudienceModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
```

In `packages/database/src/relations/index.ts` make **both** edits (AGENTS.md invariant 2):

```ts
// near line 65, with the sibling imports
import { facebookMarketingMessageAudienceRelations } from "./facebook-marketing-message-audience"
```

```ts
// near line 221, inside the relations object
  ...facebookMarketingMessageRelations,
  ...facebookMarketingMessageAudienceRelations,
  ...facebookMarketingMessagesAuthRelations,
```

In `packages/database/src/types.ts`, after `FacebookMarketingMessageModel`:

```ts
export type FacebookMarketingMessageAudienceModel =
  typeof schema.facebookMarketingMessageAudienceModel.$inferSelect
```

- [ ] **Step 4: Create the repository**

Create `packages/database/src/repositories/facebook-marketing-messages/audience-repository.ts`:

```ts
import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import { facebookMarketingMessageAudienceModel } from "../../schema"
import type { FacebookMarketingMessageAudienceModel } from "../../types"

const table = facebookMarketingMessageAudienceModel

export const facebookMarketingMessageAudienceRepository = {
  async listByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageAudienceModel[]> {
    return await tx.query.facebookMarketingMessageAudienceModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    })
  },

  async findForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageAudienceModel | null> {
    const row = await tx.query.facebookMarketingMessageAudienceModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    return row ?? null
  },

  async create(
    input: {
      id: string
      workspaceId: string
      customAudienceId: string
      adAccountId: string
      pageId: string
      name: string
      description: string | null
      facebookUserId: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageAudienceModel> {
    const [row] = await tx
      .insert(table)
      .values({ ...input, rowsUploaded: 0 })
      .returning()
    if (!row) {
      throw new Error("Failed to create FacebookMarketingMessageAudience")
    }
    return row
  },

  /** Atomic add — concurrent "upload more" calls must not lose counts. */
  async incrementRowsUploaded(
    input: { id: string; workspaceId: string; by: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(table)
      .set({ rowsUploaded: sql`${table.rowsUploaded} + ${input.by}` })
      .where(and(eq(table.id, input.id), eq(table.workspaceId, input.workspaceId)))
  },

  async markReady(
    input: { ids: string[]; workspaceId: string; readyAt: Date },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .update(table)
      .set({ readyAt: input.readyAt })
      .where(
        and(inArray(table.id, input.ids), eq(table.workspaceId, input.workspaceId)),
      )
  },

  async remove(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(table)
      .where(and(eq(table.id, input.id), eq(table.workspaceId, input.workspaceId)))
  },
}
```

> If `sql` is not re-exported from `../../client`, import it from `drizzle-orm` (check how sibling repositories import `sql`).

In `packages/database/src/repositories/facebook-marketing-messages/index.ts`:

```ts
export * from "./audience-repository"
export * from "./repository"
```

- [ ] **Step 5: Run tests and the drift guard**

Run: `pnpm --filter @chatbotx.io/database test -- facebook-marketing-message-audience-schema`
Expected: PASS.

- [ ] **Step 6: Generate the migration (do NOT apply)**

Run: `pnpm --filter @chatbotx.io/database make:migration add_facebook_marketing_message_audience`

Open the generated `migration.sql`. Per the project memory "make:migration re-emits already-applied tables", trim it to **only** the new table, its FK, and its two indexes. Expected content (names must match):

```sql
CREATE TABLE "FacebookMarketingMessageAudience" (
	"id" bigint PRIMARY KEY NOT NULL,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) ... ,
	"workspaceId" bigint NOT NULL,
	"customAudienceId" text NOT NULL,
	"adAccountId" text NOT NULL,
	"pageId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rowsUploaded" integer NOT NULL,
	"readyAt" timestamp(3),
	"facebookUserId" text
);
ALTER TABLE "FacebookMarketingMessageAudience" ADD CONSTRAINT "..._workspaceId_..._fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE cascade ON UPDATE cascade;
CREATE INDEX "FacebookMarketingMessageAudience_workspaceId_idx" ON "FacebookMarketingMessageAudience" USING btree ("workspaceId" NULLS LAST);
CREATE UNIQUE INDEX "FacebookMarketingMessageAudience_customAudienceId_key" ON "FacebookMarketingMessageAudience" USING btree ("customAudienceId" NULLS LAST);
```

(`id`/`createdAt`/`updatedAt` exactly as generated from `sharedColumns`.)

Then run: `pnpm --filter @chatbotx.io/database lint` (runs `db:check-drift`).
Expected: PASS — no further SQL would be emitted.

**STOP: show the SQL to the user. Do not run `db:migrate`.**

- [ ] **Step 7: Type-check and commit**

```bash
pnpm --filter @chatbotx.io/database check-types
git add packages/database/src/schema/facebook-marketing-message-audience.ts packages/database/src/schema/index.ts packages/database/src/relations/facebook-marketing-message-audience.ts packages/database/src/relations/index.ts packages/database/src/types.ts packages/database/src/repositories/facebook-marketing-messages/audience-repository.ts packages/database/src/repositories/facebook-marketing-messages/index.ts packages/database/__tests__/facebook-marketing-message-audience-schema.test.ts
git add <the generated migration folder: migration.sql + snapshot.json>
git commit -m "feat(database): add FacebookMarketingMessageAudience table"
```

---

### Task 6: Audience service — create, upload more, list, delete

**Files:**
- Create: `packages/business/src/facebook-marketing-message-audience/errors.ts`
- Create: `packages/business/src/facebook-marketing-message-audience/service.ts`
- Create: `packages/business/src/facebook-marketing-message-audience/index.ts`
- Modify: `packages/business/src/index.ts`
- Test: `packages/business/__tests__/facebook-marketing-message-audience-service.test.ts`

**Interfaces:**
- Consumes: Task 1 `readTabularFile`, `TabularFileError` (`@chatbotx.io/imports/parsers`); Task 3 `mapCustomerFileHeaders`, `buildCustomerFilePayload` (`@chatbotx.io/integration-facebook-ads/customer-file`); Task 4 `createMarketingMessagesAudience`, `uploadAudienceUsersSession`, `AudienceUploadError`, `deleteCustomAudience` (`@chatbotx.io/integration-facebook-ads`); Task 5 repository.
- Produces:
  - `errors.ts`: `export const AUDIENCE_ERROR_CODES = ["audienceInvalidFile","audienceTooManyRows","audienceNoIdentifier","audienceNoValidRows","audiencePartialUpload","audienceNotFound"] as const`, `export type AudienceErrorCode`, `export function audienceError(code: AudienceErrorCode, data?: Record<string, number>): ChatbotXException`, `export function isAudienceError(error: unknown): error is ChatbotXException & { code: AudienceErrorCode }`
  - `service.ts`:
    - `export const AUDIENCE_MAX_ROWS = 100_000`
    - `export const AUDIENCE_MAX_FILE_BYTES = 20 * 1024 * 1024`
    - `export type AudienceGrant = { accessToken: string; version?: string; facebookUserId: string | null }`
    - `export type AudienceUploadFile = { fileName: string; buffer: Buffer }`
    - `export type AudienceUploadResult = { id: string; customAudienceId: string; received: number; skipped: number; invalid: number }`
    - `facebookMarketingMessageAudienceService.list(workspaceId)`, `.find({ id, workspaceId })`, `.create({ workspaceId, grant, adAccountId, pageId, name, description, file })`, `.uploadMore({ workspaceId, grant, id, file })`, `.delete({ workspaceId, grant, id })`
  - Task 7 adds `.getLiveStatus` to the same class.

- [ ] **Step 1: Write the failing test**

Create `packages/business/__tests__/facebook-marketing-message-audience-service.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest"

const repository = {
  listByWorkspaceId: vi.fn(),
  findForWorkspace: vi.fn(),
  create: vi.fn(),
  incrementRowsUploaded: vi.fn(),
  markReady: vi.fn(),
  remove: vi.fn(),
}
vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessageAudienceRepository: repository,
}))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

class AudienceUploadError extends Error {
  constructor(
    readonly received: number,
    readonly invalid: number,
  ) {
    super("upload failed")
  }
}
const graph = {
  createMarketingMessagesAudience: vi.fn(),
  uploadAudienceUsersSession: vi.fn(),
  deleteCustomAudience: vi.fn(),
  getMarketingMessagesAudiences: vi.fn(),
  getNotificationMessageTokenAudienceIds: vi.fn(),
  AudienceUploadError,
}
vi.mock("@chatbotx.io/integration-facebook-ads", () => graph)
// Task 7 makes the service import the Messenger service; mock it up front so
// this file keeps passing once that import lands.
vi.mock("../src/integration-messenger/service", () => ({
  messengerIntegrationService: { findByPageId: vi.fn() },
}))

const { facebookMarketingMessageAudienceService: service } = await import(
  "../src/facebook-marketing-message-audience/service"
)

const grant = { accessToken: "T", version: "v25.0", facebookUserId: "asuid" }
const csv = (text: string) => ({
  fileName: "list.csv",
  buffer: Buffer.from(text, "utf8"),
})
const createInput = (text: string) => ({
  workspaceId: "w1",
  grant,
  adAccountId: "act_9",
  pageId: "page_1",
  name: "VIP",
  description: null,
  file: csv(text),
})

beforeEach(() => {
  vi.clearAllMocks()
  graph.createMarketingMessagesAudience.mockResolvedValue({ id: "aud_1" })
  graph.uploadAudienceUsersSession.mockResolvedValue({ received: 2, invalid: 0 })
  repository.create.mockResolvedValue({ id: "row_1", customAudienceId: "aud_1" })
})

describe("create", () => {
  test("validates, creates on Meta, inserts, uploads, and counts", async () => {
    const result = await service.create(
      createInput("email,phone\na@b.co,\n,\nc@d.co,+44 303 123 7300\n"),
    )
    expect(result).toEqual({
      id: "row_1",
      customAudienceId: "aud_1",
      received: 2,
      skipped: 0,
      invalid: 0,
    })
    expect(graph.createMarketingMessagesAudience).toHaveBeenCalledWith({
      accessToken: "T",
      adAccountId: "act_9",
      pageId: "page_1",
      name: "VIP",
      description: null,
      version: "v25.0",
    })
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        customAudienceId: "aud_1",
        facebookUserId: "asuid",
      }),
    )
    const upload = graph.uploadAudienceUsersSession.mock.calls[0]?.[0]
    expect(upload.schema).toEqual(["EMAIL", "PHONE"])
    expect(upload.data).toHaveLength(2)
    expect(repository.incrementRowsUploaded).toHaveBeenCalledWith({
      id: "row_1",
      workspaceId: "w1",
      by: 2,
    })
  })

  test("reports skipped rows", async () => {
    const result = await service.create(createInput("email\na@b.co\nnope\n"))
    expect(result.skipped).toBe(1)
  })

  test.each([
    ["no email/phone column", "fn,ln\nA,B\n", "audienceNoIdentifier"],
    ["no valid rows", "email\nnope\n", "audienceNoValidRows"],
    ["empty file", "", "audienceInvalidFile"],
  ])("%s → %s, nothing created on Meta", async (_label, text, code) => {
    await expect(service.create(createInput(text))).rejects.toMatchObject({ code })
    expect(graph.createMarketingMessagesAudience).not.toHaveBeenCalled()
    expect(repository.create).not.toHaveBeenCalled()
  })

  test("unsupported extension → audienceInvalidFile", async () => {
    await expect(
      service.create({
        ...createInput("email\na@b.co\n"),
        file: { fileName: "list.xls", buffer: Buffer.from("x") },
      }),
    ).rejects.toMatchObject({ code: "audienceInvalidFile" })
  })

  test("partial upload keeps the row, persists the count, and reports it", async () => {
    graph.uploadAudienceUsersSession.mockRejectedValue(
      new AudienceUploadError(10_000, 3),
    )
    await expect(service.create(createInput("email\na@b.co\n"))).rejects.toMatchObject({
      code: "audiencePartialUpload",
      data: { received: 10_000 },
    })
    expect(repository.create).toHaveBeenCalled()
    expect(repository.remove).not.toHaveBeenCalled()
    expect(repository.incrementRowsUploaded).toHaveBeenCalledWith({
      id: "row_1",
      workspaceId: "w1",
      by: 10_000,
    })
  })
})

describe("uploadMore", () => {
  test("uploads to the existing audience and accumulates", async () => {
    repository.findForWorkspace.mockResolvedValue({
      id: "row_1",
      customAudienceId: "aud_1",
    })
    const result = await service.uploadMore({
      workspaceId: "w1",
      grant,
      id: "row_1",
      file: csv("email\na@b.co\n"),
    })
    expect(result.received).toBe(2)
    expect(graph.createMarketingMessagesAudience).not.toHaveBeenCalled()
    expect(graph.uploadAudienceUsersSession.mock.calls[0]?.[0].customAudienceId).toBe(
      "aud_1",
    )
    expect(repository.incrementRowsUploaded).toHaveBeenCalled()
  })

  test("unknown row → audienceNotFound", async () => {
    repository.findForWorkspace.mockResolvedValue(null)
    await expect(
      service.uploadMore({ workspaceId: "w1", grant, id: "x", file: csv("email\na@b.co\n") }),
    ).rejects.toMatchObject({ code: "audienceNotFound" })
  })
})

describe("delete", () => {
  beforeEach(() => {
    repository.findForWorkspace.mockResolvedValue({
      id: "row_1",
      customAudienceId: "aud_1",
      name: "VIP",
    })
  })

  test("deletes on Meta then locally", async () => {
    graph.deleteCustomAudience.mockResolvedValue({ status: "deleted" })
    await service.delete({ workspaceId: "w1", grant, id: "row_1" })
    expect(repository.remove).toHaveBeenCalledWith({ id: "row_1", workspaceId: "w1" })
  })

  test("still deletes locally when Meta says it no longer exists", async () => {
    graph.deleteCustomAudience.mockResolvedValue({ status: "notFound" })
    await service.delete({ workspaceId: "w1", grant, id: "row_1" })
    expect(repository.remove).toHaveBeenCalled()
  })

  test("keeps the row on any other Graph error", async () => {
    graph.deleteCustomAudience.mockRejectedValue(new Error("Permissions error"))
    await expect(
      service.delete({ workspaceId: "w1", grant, id: "row_1" }),
    ).rejects.toThrow("Permissions error")
    expect(repository.remove).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/business test -- facebook-marketing-message-audience-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the errors module**

Create `packages/business/src/facebook-marketing-message-audience/errors.ts`:

```ts
import { ChatbotXException } from "../errors"

/**
 * Codes the builder maps to translated messages. The exception `message` is
 * the code itself — never shown raw; `data` carries interpolation params.
 */
export const AUDIENCE_ERROR_CODES = [
  "audienceInvalidFile",
  "audienceTooManyRows",
  "audienceNoIdentifier",
  "audienceNoValidRows",
  "audiencePartialUpload",
  "audienceNotFound",
] as const

export type AudienceErrorCode = (typeof AUDIENCE_ERROR_CODES)[number]

export function audienceError(
  code: AudienceErrorCode,
  data?: Record<string, number>,
): ChatbotXException {
  const error = new ChatbotXException(code, code)
  if (data) {
    error.data = data
  }
  return error
}

export function isAudienceError(
  error: unknown,
): error is ChatbotXException & { code: AudienceErrorCode } {
  return (
    error instanceof ChatbotXException &&
    (AUDIENCE_ERROR_CODES as readonly string[]).includes(error.code)
  )
}
```

- [ ] **Step 4: Write the service**

Create `packages/business/src/facebook-marketing-message-audience/service.ts`:

```ts
import { facebookMarketingMessageAudienceRepository } from "@chatbotx.io/database/repositories"
import type { FacebookMarketingMessageAudienceModel } from "@chatbotx.io/database/types"
import {
  readTabularFile,
  TabularFileError,
  type TabularFormat,
} from "@chatbotx.io/imports/parsers"
import {
  AudienceUploadError,
  createMarketingMessagesAudience,
  deleteCustomAudience,
  uploadAudienceUsersSession,
} from "@chatbotx.io/integration-facebook-ads"
import {
  buildCustomerFilePayload,
  type CustomerFilePayload,
  mapCustomerFileHeaders,
} from "@chatbotx.io/integration-facebook-ads/customer-file"
import { getChildLogger } from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { audienceError } from "./errors"

const log = getChildLogger("facebook-marketing-message-audience")

export const AUDIENCE_MAX_ROWS = 100_000
export const AUDIENCE_MAX_FILE_BYTES = 20 * 1024 * 1024

export type AudienceGrant = {
  accessToken: string
  version?: string
  facebookUserId: string | null
}

export type AudienceUploadFile = { fileName: string; buffer: Buffer }

export type AudienceUploadResult = {
  id: string
  customAudienceId: string
  received: number
  skipped: number
  invalid: number
}

const FORMAT_BY_EXTENSION: Record<string, TabularFormat> = {
  ".csv": "csv",
  ".txt": "csv",
  ".xlsx": "xlsx",
}

function formatOf(fileName: string): TabularFormat | undefined {
  const dot = fileName.lastIndexOf(".")
  return dot > 0
    ? FORMAT_BY_EXTENSION[fileName.slice(dot).toLowerCase()]
    : undefined
}

/**
 * Parse → map headers → normalize + hash, entirely before any Graph call
 * (spec D9). Plain PII only ever lives in this function's memory.
 */
async function preparePayload(
  file: AudienceUploadFile,
): Promise<CustomerFilePayload> {
  const format = formatOf(file.fileName)
  if (!format) {
    throw audienceError("audienceInvalidFile")
  }

  let table: Awaited<ReturnType<typeof readTabularFile>>
  try {
    table = await readTabularFile({
      format,
      buffer: file.buffer,
      maxRows: AUDIENCE_MAX_ROWS,
      maxBytes: AUDIENCE_MAX_FILE_BYTES,
    })
  } catch (error) {
    if (error instanceof TabularFileError && error.reason === "tooManyRows") {
      throw audienceError("audienceTooManyRows", { max: AUDIENCE_MAX_ROWS })
    }
    throw audienceError("audienceInvalidFile")
  }

  const mapped = mapCustomerFileHeaders(table.headers)
  if (!mapped.ok) {
    throw audienceError("audienceNoIdentifier")
  }
  const payload = buildCustomerFilePayload(table.rows, mapped.columns)
  if (payload.data.length === 0) {
    throw audienceError("audienceNoValidRows")
  }
  return payload
}

class FacebookMarketingMessageAudienceService extends BaseService {
  list(workspaceId: string): Promise<FacebookMarketingMessageAudienceModel[]> {
    return facebookMarketingMessageAudienceRepository.listByWorkspaceId(
      workspaceId,
    )
  }

  find(input: {
    id: string
    workspaceId: string
  }): Promise<FacebookMarketingMessageAudienceModel | null> {
    return facebookMarketingMessageAudienceRepository.findForWorkspace(input)
  }

  async create(input: {
    workspaceId: string
    grant: AudienceGrant
    adAccountId: string
    pageId: string
    name: string
    description: string | null
    file: AudienceUploadFile
  }): Promise<AudienceUploadResult> {
    const payload = await preparePayload(input.file)

    const audience = await createMarketingMessagesAudience({
      accessToken: input.grant.accessToken,
      adAccountId: input.adAccountId,
      pageId: input.pageId,
      name: input.name,
      description: input.description,
      version: input.grant.version,
    })

    const row = await facebookMarketingMessageAudienceRepository.create({
      id: createId(),
      workspaceId: input.workspaceId,
      customAudienceId: audience.id,
      adAccountId: input.adAccountId,
      pageId: input.pageId,
      name: input.name,
      description: input.description,
      facebookUserId: input.grant.facebookUserId,
    })
    await this.audit(
      "create",
      `created the marketing messages audience "${input.name}"`,
    )

    return await this.upload(row, input.workspaceId, input.grant, payload)
  }

  async uploadMore(input: {
    workspaceId: string
    grant: AudienceGrant
    id: string
    file: AudienceUploadFile
  }): Promise<AudienceUploadResult> {
    const row = await this.find({ id: input.id, workspaceId: input.workspaceId })
    if (!row) {
      throw audienceError("audienceNotFound")
    }
    const payload = await preparePayload(input.file)
    return await this.upload(row, input.workspaceId, input.grant, payload)
  }

  async delete(input: {
    workspaceId: string
    grant: AudienceGrant
    id: string
  }): Promise<void> {
    const row = await this.find({ id: input.id, workspaceId: input.workspaceId })
    if (!row) {
      throw audienceError("audienceNotFound")
    }
    // `notFound` (deleted in Ads Manager) still removes our row; any other
    // Graph error propagates and keeps it.
    await deleteCustomAudience({
      accessToken: input.grant.accessToken,
      customAudienceId: row.customAudienceId,
      version: input.grant.version,
    })
    await facebookMarketingMessageAudienceRepository.remove({
      id: row.id,
      workspaceId: input.workspaceId,
    })
    await this.audit(
      "delete",
      `deleted the marketing messages audience "${row.name}"`,
    )
  }

  private async upload(
    row: Pick<FacebookMarketingMessageAudienceModel, "id" | "customAudienceId">,
    workspaceId: string,
    grant: AudienceGrant,
    payload: CustomerFilePayload,
  ): Promise<AudienceUploadResult> {
    try {
      const { received, invalid } = await uploadAudienceUsersSession({
        accessToken: grant.accessToken,
        customAudienceId: row.customAudienceId,
        schema: payload.schema,
        data: payload.data,
        version: grant.version,
      })
      await facebookMarketingMessageAudienceRepository.incrementRowsUploaded({
        id: row.id,
        workspaceId,
        by: received,
      })
      return {
        id: row.id,
        customAudienceId: row.customAudienceId,
        received,
        skipped: payload.skipped,
        invalid,
      }
    } catch (error) {
      if (!(error instanceof AudienceUploadError)) {
        throw error
      }
      if (error.received > 0) {
        await facebookMarketingMessageAudienceRepository.incrementRowsUploaded({
          id: row.id,
          workspaceId,
          by: error.received,
        })
      }
      // Ids and counts only — never PII.
      log.error(
        {
          err: error,
          workspaceId,
          customAudienceId: row.customAudienceId,
          received: error.received,
        },
        "Marketing messages audience upload failed mid-session",
      )
      throw audienceError("audiencePartialUpload", { received: error.received })
    }
  }
}

export const facebookMarketingMessageAudienceService =
  new FacebookMarketingMessageAudienceService()
```

Create `packages/business/src/facebook-marketing-message-audience/index.ts`:

```ts
export * from "./errors"
export * from "./service"
```

In `packages/business/src/index.ts`, after `export * from "./facebook-marketing-messages"`:

```ts
export * from "./facebook-marketing-message-audience"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @chatbotx.io/business test -- facebook-marketing-message-audience-service`
Expected: PASS. (The real `@chatbotx.io/imports/parsers` and `customer-file` modules run unmocked, so the hashing path is exercised end to end.)

- [ ] **Step 6: Type-check and commit**

```bash
pnpm --filter @chatbotx.io/business check-types
git add packages/business/src/facebook-marketing-message-audience/errors.ts packages/business/src/facebook-marketing-message-audience/service.ts packages/business/src/facebook-marketing-message-audience/index.ts packages/business/src/index.ts packages/business/__tests__/facebook-marketing-message-audience-service.test.ts
git commit -m "feat(business): add marketing messages audience create, upload and delete"
```

---

### Task 7: Audience service — live status and ready check

**Files:**
- Modify: `packages/business/src/facebook-marketing-message-audience/service.ts`
- Test: `packages/business/__tests__/facebook-marketing-message-audience-live-status.test.ts`

**Interfaces:**
- Consumes: Task 4 `getMarketingMessagesAudiences`, `getNotificationMessageTokenAudienceIds`; Task 5 `markReady`; `messengerIntegrationService.findByPageId({ workspaceId, pageId })` (existing, `packages/business/src/integration-messenger/service.ts`) returning a row with `auth` (plain `MessengerAuthValue`: `{ tokens: { accessToken }, version?, … }`).
- Produces:
  - `export type AudienceLiveStatus = { lower: number | null; upper: number | null; deliveryStatus: { code: number; description: string } | null; ready: boolean; missingOnMeta: boolean; pageDisconnected: boolean }`
  - `facebookMarketingMessageAudienceService.getLiveStatus({ workspaceId: string; grant: AudienceGrant }): Promise<Record<string, AudienceLiveStatus>>` keyed by `customAudienceId`.

- [ ] **Step 1: Write the failing test**

Create `packages/business/__tests__/facebook-marketing-message-audience-live-status.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest"

const repository = {
  listByWorkspaceId: vi.fn(),
  findForWorkspace: vi.fn(),
  create: vi.fn(),
  incrementRowsUploaded: vi.fn(),
  markReady: vi.fn(),
  remove: vi.fn(),
}
vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessageAudienceRepository: repository,
}))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

const graph = {
  createMarketingMessagesAudience: vi.fn(),
  uploadAudienceUsersSession: vi.fn(),
  deleteCustomAudience: vi.fn(),
  getMarketingMessagesAudiences: vi.fn(),
  getNotificationMessageTokenAudienceIds: vi.fn(),
  AudienceUploadError: class extends Error {},
}
vi.mock("@chatbotx.io/integration-facebook-ads", () => graph)

const findByPageId = vi.fn()
vi.mock("../src/integration-messenger/service", () => ({
  messengerIntegrationService: { findByPageId },
}))

const { facebookMarketingMessageAudienceService: service } = await import(
  "../src/facebook-marketing-message-audience/service"
)

const grant = { accessToken: "T", version: "v25.0", facebookUserId: null }
const row = (overrides: Record<string, unknown>) => ({
  id: "row",
  customAudienceId: "aud",
  adAccountId: "act_1",
  pageId: "page_1",
  readyAt: null,
  ...overrides,
})
const meta = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  description: null,
  deliveryStatus: { code: 200, description: "Ready" },
  operationStatus: null,
  approximateCountLowerBound: 1000,
  approximateCountUpperBound: 1200,
  pageId: "page_1",
  ...overrides,
})
const pageIntegration = (token: string) => ({
  auth: { tokens: { accessToken: token }, version: "v25.0" },
})

beforeEach(() => {
  vi.clearAllMocks()
  findByPageId.mockResolvedValue(pageIntegration("PAGE_TOKEN"))
  graph.getNotificationMessageTokenAudienceIds.mockResolvedValue([])
})

describe("getLiveStatus", () => {
  test("no rows → no Graph calls", async () => {
    repository.listByWorkspaceId.mockResolvedValue([])
    await expect(service.getLiveStatus({ workspaceId: "w1", grant })).resolves.toEqual({})
    expect(graph.getMarketingMessagesAudiences).not.toHaveBeenCalled()
  })

  test("merges counts and delivery status, and persists newly-ready rows", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1" }),
      row({ id: "r2", customAudienceId: "aud_2" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([
      meta("aud_1"),
      meta("aud_2", { deliveryStatus: { code: 300, description: "Too small" } }),
      meta("aud_other"),
    ])
    graph.getNotificationMessageTokenAudienceIds.mockImplementation(
      ({ customAudienceId }: { customAudienceId: string }) =>
        Promise.resolve(customAudienceId === "aud_1" ? ["aud_1"] : []),
    )

    const result = await service.getLiveStatus({ workspaceId: "w1", grant })

    expect(result).toEqual({
      aud_1: {
        lower: 1000,
        upper: 1200,
        deliveryStatus: { code: 200, description: "Ready" },
        ready: true,
        missingOnMeta: false,
        pageDisconnected: false,
      },
      aud_2: {
        lower: 1000,
        upper: 1200,
        deliveryStatus: { code: 300, description: "Too small" },
        ready: false,
        missingOnMeta: false,
        pageDisconnected: false,
      },
    })
    expect(graph.getNotificationMessageTokenAudienceIds).toHaveBeenCalledWith({
      pageAccessToken: "PAGE_TOKEN",
      pageId: "page_1",
      customAudienceId: "aud_1",
      version: "v25.0",
    })
    expect(repository.markReady).toHaveBeenCalledWith({
      ids: ["r1"],
      workspaceId: "w1",
      readyAt: expect.any(Date),
    })
  })

  test("rows already ready skip the token call", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", readyAt: new Date() }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([meta("aud_1")])
    const result = await service.getLiveStatus({ workspaceId: "w1", grant })
    expect(result.aud_1?.ready).toBe(true)
    expect(graph.getNotificationMessageTokenAudienceIds).not.toHaveBeenCalled()
    expect(repository.markReady).not.toHaveBeenCalled()
  })

  test("an audience absent from Meta is missingOnMeta and gets no token call", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_gone" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([])
    const result = await service.getLiveStatus({ workspaceId: "w1", grant })
    expect(result.aud_gone).toMatchObject({ missingOnMeta: true, ready: false })
    expect(graph.getNotificationMessageTokenAudienceIds).not.toHaveBeenCalled()
  })

  test("a disconnected Page skips the check and flags only its rows", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", pageId: "page_gone" }),
      row({ id: "r2", customAudienceId: "aud_2", pageId: "page_1" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([meta("aud_1"), meta("aud_2")])
    findByPageId.mockImplementation(({ pageId }: { pageId: string }) =>
      Promise.resolve(pageId === "page_1" ? pageIntegration("PAGE_TOKEN") : null),
    )
    const result = await service.getLiveStatus({ workspaceId: "w1", grant })
    expect(result.aud_1).toMatchObject({ pageDisconnected: true, ready: false })
    expect(result.aud_2).toMatchObject({ pageDisconnected: false })
    expect(graph.getNotificationMessageTokenAudienceIds).toHaveBeenCalledTimes(1)
  })

  test("a failing token call (revoked Page token) does not break other rows", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", pageId: "page_bad" }),
      row({ id: "r2", customAudienceId: "aud_2", pageId: "page_1" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([meta("aud_1"), meta("aud_2")])
    graph.getNotificationMessageTokenAudienceIds.mockImplementation(
      ({ pageId }: { pageId: string }) =>
        pageId === "page_bad"
          ? Promise.reject(new Error("Invalid OAuth access token"))
          : Promise.resolve(["aud_2"]),
    )
    const result = await service.getLiveStatus({ workspaceId: "w1", grant })
    expect(result.aud_1).toMatchObject({ ready: false, lower: 1000 })
    expect(result.aud_2).toMatchObject({ ready: true })
  })

  test("a failing ad account leaves its rows with null live data, others intact", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", adAccountId: "act_bad" }),
      row({ id: "r2", customAudienceId: "aud_2", adAccountId: "act_1" }),
    ])
    graph.getMarketingMessagesAudiences.mockImplementation(
      ({ adAccountId }: { adAccountId: string }) =>
        adAccountId === "act_bad"
          ? Promise.reject(new Error("boom"))
          : Promise.resolve([meta("aud_2")]),
    )
    const result = await service.getLiveStatus({ workspaceId: "w1", grant })
    expect(result.aud_1).toEqual({
      lower: null,
      upper: null,
      deliveryStatus: null,
      ready: false,
      missingOnMeta: false,
      pageDisconnected: false,
    })
    expect(result.aud_2?.lower).toBe(1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @chatbotx.io/business test -- facebook-marketing-message-audience-live-status`
Expected: FAIL — `service.getLiveStatus is not a function`.

- [ ] **Step 3: Implement `getLiveStatus`**

In `packages/business/src/facebook-marketing-message-audience/service.ts`:

1. Extend imports:

```ts
import {
  AudienceUploadError,
  createMarketingMessagesAudience,
  deleteCustomAudience,
  getMarketingMessagesAudiences,
  getNotificationMessageTokenAudienceIds,
  type MarketingMessagesAudience,
  uploadAudienceUsersSession,
} from "@chatbotx.io/integration-facebook-ads"
import { z } from "zod"
import { messengerIntegrationService } from "../integration-messenger/service"
```

2. Add below `AudienceUploadResult`:

```ts
export type AudienceLiveStatus = {
  lower: number | null
  upper: number | null
  deliveryStatus: { code: number; description: string } | null
  ready: boolean
  missingOnMeta: boolean
  pageDisconnected: boolean
}

const TOKEN_CHECK_CONCURRENCY = 5

// The Messenger integration stores its auth as plain `MessengerAuthValue`;
// validate the one field we need instead of casting.
const pageAuthSchema = z.object({
  tokens: z.object({ accessToken: z.string().min(1) }),
  version: z.string().optional(),
})

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      if (item !== undefined) {
        await fn(item)
      }
    }
  })
  await Promise.all(workers)
}

const groupBy = <T>(items: T[], key: (item: T) => string) => {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(key(item)) ?? []
    group.push(item)
    groups.set(key(item), group)
  }
  return groups
}
```

3. Add the method to the class (after `delete`):

```ts
  /**
   * Live count/status per audience plus the subscription-token ready check
   * (spec §4.3). Partial Graph failures are logged and isolated to the
   * affected account or Page; this never throws for them.
   */
  async getLiveStatus(input: {
    workspaceId: string
    grant: AudienceGrant
  }): Promise<Record<string, AudienceLiveStatus>> {
    const rows = await this.list(input.workspaceId)
    if (rows.length === 0) {
      return {}
    }

    const metaById = new Map<string, MarketingMessagesAudience>()
    const failedAccounts = new Set<string>()
    await Promise.all(
      [...groupBy(rows, (row) => row.adAccountId).keys()].map(
        async (adAccountId) => {
          try {
            const audiences = await getMarketingMessagesAudiences({
              accessToken: input.grant.accessToken,
              adAccountId,
              version: input.grant.version,
            })
            for (const audience of audiences) {
              metaById.set(audience.id, audience)
            }
          } catch (error) {
            failedAccounts.add(adAccountId)
            log.error(
              { err: error, workspaceId: input.workspaceId, adAccountId },
              "Failed to load marketing messages audiences",
            )
          }
        },
      ),
    )

    const result: Record<string, AudienceLiveStatus> = {}
    for (const row of rows) {
      const meta = metaById.get(row.customAudienceId)
      result[row.customAudienceId] = {
        lower: meta?.approximateCountLowerBound ?? null,
        upper: meta?.approximateCountUpperBound ?? null,
        deliveryStatus: meta?.deliveryStatus ?? null,
        ready: row.readyAt !== null,
        missingOnMeta: !(meta || failedAccounts.has(row.adAccountId)),
        pageDisconnected: false,
      }
    }

    const pending = rows.filter(
      (row) =>
        row.readyAt === null && !result[row.customAudienceId]?.missingOnMeta,
    )
    const newlyReady: string[] = []

    await Promise.all(
      [...groupBy(pending, (row) => row.pageId).entries()].map(
        async ([pageId, pageRows]) => {
          const integration = await messengerIntegrationService.findByPageId({
            workspaceId: input.workspaceId,
            pageId,
          })
          const auth = pageAuthSchema.safeParse(integration?.auth)
          if (!auth.success) {
            for (const row of pageRows) {
              const status = result[row.customAudienceId]
              if (status) {
                status.pageDisconnected = true
              }
            }
            return
          }

          await mapWithConcurrency(pageRows, TOKEN_CHECK_CONCURRENCY, async (row) => {
            try {
              const ids = await getNotificationMessageTokenAudienceIds({
                pageAccessToken: auth.data.tokens.accessToken,
                pageId,
                customAudienceId: row.customAudienceId,
                version: auth.data.version ?? input.grant.version,
              })
              const status = result[row.customAudienceId]
              if (status && ids.includes(row.customAudienceId)) {
                status.ready = true
                newlyReady.push(row.id)
              }
            } catch (error) {
              log.error(
                {
                  err: error,
                  workspaceId: input.workspaceId,
                  pageId,
                  customAudienceId: row.customAudienceId,
                },
                "Marketing messages audience token check failed",
              )
            }
          })
        },
      ),
    )

    if (newlyReady.length > 0) {
      await facebookMarketingMessageAudienceRepository.markReady({
        ids: newlyReady,
        workspaceId: input.workspaceId,
        readyAt: new Date(),
      })
    }

    return result
  }
```

> If `messengerIntegrationService` is exported from a different path than `../integration-messenger/service`, use that path and update the `vi.mock` path in the test to match.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @chatbotx.io/business test -- facebook-marketing-message-audience`
Expected: PASS (both service test files).

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @chatbotx.io/business check-types
git add packages/business/src/facebook-marketing-message-audience/service.ts packages/business/__tests__/facebook-marketing-message-audience-live-status.test.ts
git commit -m "feat(business): add live status and ready check for marketing messages audiences"
```

---

### Task 8: i18n keys (all 22 locales)

**Files:**
- Modify: `apps/builder/messages/*.json` (all 22)

**Interfaces:**
- Produces: the keys below under `facebookMarketingMessages`. Later tasks reference them exactly.

- [ ] **Step 1: Add the English keys**

In `apps/builder/messages/en.json`, inside `"facebookMarketingMessages"`, add:

```json
"tabs": {
  "campaigns": "Campaigns",
  "audiences": "Audiences"
},
"audiences": {
  "title": "Custom Audiences",
  "create": "Create New",
  "uploadMore": "Upload more rows",
  "empty": "No custom audiences yet.",
  "deleteTitle": "Delete custom audience",
  "deleteWarning": "This deletes the custom audience \"{name}\" on Meta and in ChatbotX. This cannot be undone.",
  "deleted": "Custom audience deleted.",
  "pageDisconnected": "Page disconnected",
  "status": {
    "ready": "Ready",
    "missing": "Deleted on Meta"
  },
  "fields": {
    "customAudienceId": "Custom Audience ID",
    "description": "Description",
    "approximateCount": "Approximate count",
    "status": "Status",
    "file": "Upload file"
  },
  "wizard": {
    "title": "Create custom audience",
    "uploadMoreTitle": "Upload more rows",
    "steps": {
      "prepare": "Prepare list",
      "upload": "Upload",
      "confirm": "Confirm"
    },
    "prepareDescription": "A subscriber list is a CSV or TXT file containing information used to build your audience for marketing messages. We use the phone number to match your subscribers to Facebook and Instagram users. Before the information is sent to us, your list of identifiers gets hashed into random code.",
    "aboutHashing": "About hashing",
    "downloadTemplate": "Download file template",
    "mainIdentifiers": "Include at least one main identifier",
    "moreIdentifiers": "Include more identifiers",
    "identifiers": {
      "email": "Email",
      "phone": "Phone Number",
      "madid": "Mobile advertiser ID",
      "fn": "First name",
      "ln": "Last name",
      "ct": "City",
      "st": "State/Province",
      "country": "Country",
      "zip": "ZIP/Postal Code",
      "dob": "Date of birth",
      "doby": "Year of birth",
      "gen": "Gender"
    },
    "uploadNote": "Before uploading the list, make sure the identifiers are complete and in the correct format. The list must be in .csv, .txt or .xlsx format.",
    "namePlaceholder": "Enter audience name...",
    "descriptionPlaceholder": "Brief description (if any)",
    "dropzone": "Click to upload or drag and drop",
    "maxFileSize": "Maximum file size: 20MB",
    "fileRequired": "Select a file to upload.",
    "fileTooLarge": "The file is larger than 20MB.",
    "fileType": "The file must be .csv, .txt or .xlsx.",
    "next": "Next",
    "back": "Back",
    "upload": "Upload",
    "done": "Done",
    "successTitle": "Upload successful",
    "successRows": "Your Messenger subscriber list has been uploaded {count, plural, one {# row} other {# rows}}",
    "skippedRows": "{count, plural, one {# row was} other {# rows were}} skipped (no valid email or phone).",
    "invalidRows": "{count, plural, one {# row was} other {# rows were}} rejected by Meta.",
    "matchingNote": "We may need a few minutes to finish matching your subscribers with people on Facebook. You can check the status in the Audience list."
  },
  "errors": {
    "audienceInvalidFile": "The file could not be read. Use a .csv, .txt or .xlsx file with a header row.",
    "audienceTooManyRows": "The file has more than {max, number} rows.",
    "audienceNoIdentifier": "The file needs an email or phone column.",
    "audienceNoValidRows": "No row has a valid email or phone number.",
    "audiencePartialUpload": "The audience was created, but the upload stopped after {received, number} rows. Use \"Upload more rows\" to retry.",
    "audienceNotFound": "Custom audience not found.",
    "pageNotConnected": "The selected Page is not connected to this workspace."
  }
}
```

- [ ] **Step 2: Add the keys to the other 21 locales**

For each of `ar, az, da, de, es, fi, fr, he, id, it, ja, nl, pt-BR, pt-PT, ro, sv, tr, vi, zh-CN, zh-TW`, add the identical key structure under `facebookMarketingMessages`, with the values translated into that language. Keep ICU placeholders (`{name}`, `{count, plural, …}`, `{max, number}`, `{received, number}`) and the literal file extensions unchanged. Write a small throwaway Node script in the scratchpad that deep-merges a per-locale object into each file, preserving key order and 2-space indentation; do not commit the script.

- [ ] **Step 3: Verify**

Run: `pnpm --filter builder i18n:check`
Expected: PASS — no missing or extra keys in any locale.

- [ ] **Step 4: Commit**

```bash
git add apps/builder/messages/*.json
git commit -m "feat(i18n): add marketing messages custom audience strings"
```

---

### Task 9: Builder server actions, oRPC queries, and error mapping

**Files:**
- Create: `apps/builder/src/features/facebook-marketing-messages/schema/audience.ts`
- Create: `apps/builder/src/features/facebook-marketing-messages/lib/audience-errors.ts`
- Create: `apps/builder/src/features/facebook-marketing-messages/actions/create-audience.action.ts`
- Create: `apps/builder/src/features/facebook-marketing-messages/actions/upload-more-audience.action.ts`
- Create: `apps/builder/src/features/facebook-marketing-messages/actions/delete-audience.action.ts`
- Modify: `apps/builder/src/features/facebook-marketing-messages/api/private.ts`
- Test: `apps/builder/__tests__/marketing-messages-audience-actions.test.ts`

**Interfaces:**
- Consumes: `facebookMarketingMessageAudienceService`, `isAudienceError`, `AudienceUploadResult` (Task 6/7); `requireValidGrant` (existing); `getMarketingMessagesAdAccounts` (existing); `messengerIntegrationService.findByPageId` (existing); `isCustomAudienceTosAccepted`, `customAudienceTosUrl` (existing `lib/tos.ts`).
- Produces:
  - `schema/audience.ts`: `AUDIENCE_ACCEPTED_EXTENSIONS = [".csv", ".txt", ".xlsx"]`, `AUDIENCE_ACCEPT_ATTRIBUTE = ".csv,.txt,.xlsx"`, `AUDIENCE_MAX_FILE_BYTES = 20 * 1024 * 1024`, `AUDIENCE_NAME_MAX = 100`, `AUDIENCE_DESCRIPTION_MAX = 500`, `audienceFileSchema`, `createAudienceSchema`, `uploadMoreAudienceSchema`, `deleteAudienceSchema`, and their `z.infer` types `CreateAudienceInput`, `UploadMoreAudienceInput`.
  - `lib/audience-errors.ts`: `withAudienceErrors<T>(fn: () => Promise<T>): Promise<T>`
  - Actions: `createAudience({ workspace, input })` + `createAudienceAction`; `uploadMoreAudience({ workspace, input })` + `uploadMoreAudienceAction`; `deleteAudienceAction`. All return/resolve `AudienceUploadResult` (create/upload) or `void` (delete).
  - oRPC: `facebookMarketingMessagesAPI.listMarketingMessagesAudiencesAPI` → `{ audiences: AudienceRow[] }`; `facebookMarketingMessagesAPI.listMarketingMessagesAudiencesLiveAPI` → `{ statuses: Record<string, AudienceLiveStatus> }`.

- [ ] **Step 1: Write the failing test**

Create `apps/builder/__tests__/marketing-messages-audience-actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest"

const TOS_URL_PATTERN = /customaudiences\/tos/

class ChatbotXException extends Error {
  code: string
  data?: Record<string, number>
  constructor(message: string, code = "systemError") {
    super(message)
    this.code = code
  }
}

const serviceCreate = vi.fn()
const findByPageId = vi.fn()
const getMarketingMessagesAdAccounts = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  facebookMarketingMessageAudienceService: { create: serviceCreate },
  messengerIntegrationService: { findByPageId },
  isAudienceError: (error: unknown) =>
    error instanceof ChatbotXException && error.code.startsWith("audience"),
}))
vi.mock("@chatbotx.io/business/errors", () => ({ ChatbotXException }))
vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  getMarketingMessagesAdAccounts,
}))
vi.mock("@/features/facebook-marketing-messages/lib/grant", () => ({
  requireValidGrant: vi.fn(() =>
    Promise.resolve({
      state: "valid",
      accessToken: "TOKEN",
      version: "v25.0",
      facebookUserId: "asuid",
    }),
  ),
}))
vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (handler: unknown) => handler }),
    }),
  },
}))
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
    ),
}))

const { createAudience } = await import(
  "@/features/facebook-marketing-messages/actions/create-audience.action"
)

const workspace = { id: "w1" } as never
const file = new File(["email\na@b.co\n"], "list.csv", { type: "text/csv" })
const input = {
  adAccountId: "act_9",
  pageId: "page_1",
  name: "VIP",
  description: "",
  file,
}

beforeEach(() => {
  vi.clearAllMocks()
  getMarketingMessagesAdAccounts.mockResolvedValue([
    { id: "act_9", accountId: "9", currency: "USD", tosAccepted: { custom_audience_tos: 1 } },
  ])
  findByPageId.mockResolvedValue({ id: "integration" })
  serviceCreate.mockResolvedValue({
    id: "row_1",
    customAudienceId: "aud_1",
    received: 1,
    skipped: 0,
    invalid: 0,
  })
})

describe("createAudience", () => {
  test("passes the grant, file buffer, and a null empty description to the service", async () => {
    await expect(createAudience({ workspace, input })).resolves.toMatchObject({
      received: 1,
    })
    const call = serviceCreate.mock.calls[0]?.[0]
    expect(call).toMatchObject({
      workspaceId: "w1",
      grant: { accessToken: "TOKEN", version: "v25.0", facebookUserId: "asuid" },
      adAccountId: "act_9",
      pageId: "page_1",
      name: "VIP",
      description: null,
    })
    expect(call.file.fileName).toBe("list.csv")
    expect(Buffer.isBuffer(call.file.buffer)).toBe(true)
  })

  test("rejects an ad account whose ToS is not accepted, with the link", async () => {
    getMarketingMessagesAdAccounts.mockResolvedValue([
      { id: "act_9", accountId: "9", currency: "USD", tosAccepted: {} },
    ])
    await expect(createAudience({ workspace, input })).rejects.toThrow(TOS_URL_PATTERN)
    expect(serviceCreate).not.toHaveBeenCalled()
  })

  test("rejects an ad account not visible to the grant", async () => {
    getMarketingMessagesAdAccounts.mockResolvedValue([])
    await expect(createAudience({ workspace, input })).rejects.toThrow(
      "facebookMarketingMessages.errors.notGranted",
    )
  })

  test("rejects a Page that is not connected to the workspace", async () => {
    findByPageId.mockResolvedValue(null)
    await expect(createAudience({ workspace, input })).rejects.toThrow(
      "facebookMarketingMessages.audiences.errors.pageNotConnected",
    )
  })

  test("translates service error codes with their data", async () => {
    const error = new ChatbotXException("audiencePartialUpload", "audiencePartialUpload")
    error.data = { received: 10_000 }
    serviceCreate.mockRejectedValue(error)
    await expect(createAudience({ workspace, input })).rejects.toThrow(
      'facebookMarketingMessages.audiences.errors.audiencePartialUpload {"received":10000}',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter builder test -- marketing-messages-audience-actions`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema**

Create `apps/builder/src/features/facebook-marketing-messages/schema/audience.ts`:

```ts
import { z } from "zod"

export const AUDIENCE_ACCEPTED_EXTENSIONS = [".csv", ".txt", ".xlsx"] as const
export const AUDIENCE_ACCEPT_ATTRIBUTE = AUDIENCE_ACCEPTED_EXTENSIONS.join(",")
export const AUDIENCE_MAX_FILE_BYTES = 20 * 1024 * 1024
export const AUDIENCE_NAME_MAX = 100
export const AUDIENCE_DESCRIPTION_MAX = 500

export const hasAcceptedExtension = (fileName: string) =>
  AUDIENCE_ACCEPTED_EXTENSIONS.some((extension) =>
    fileName.toLowerCase().endsWith(extension),
  )

// Messages are i18n keys under facebookMarketingMessages.audiences.wizard.*;
// the client renders them through `t`.
export const audienceFileSchema = z
  .instanceof(File, { message: "fileRequired" })
  .refine((file) => file.size > 0, { message: "fileRequired" })
  .refine((file) => file.size <= AUDIENCE_MAX_FILE_BYTES, {
    message: "fileTooLarge",
  })
  .refine((file) => hasAcceptedExtension(file.name), { message: "fileType" })

export const createAudienceSchema = z.object({
  adAccountId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(AUDIENCE_NAME_MAX),
  description: z.string().trim().max(AUDIENCE_DESCRIPTION_MAX).optional(),
  file: audienceFileSchema,
})
export type CreateAudienceInput = z.infer<typeof createAudienceSchema>

export const uploadMoreAudienceSchema = z.object({
  id: z.string().trim().min(1),
  file: audienceFileSchema,
})
export type UploadMoreAudienceInput = z.infer<typeof uploadMoreAudienceSchema>

export const deleteAudienceSchema = z.object({ id: z.string().trim().min(1) })
```

- [ ] **Step 4: Write the error mapper**

Create `apps/builder/src/features/facebook-marketing-messages/lib/audience-errors.ts`:

```ts
import "server-only"

import { isAudienceError } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"

/**
 * Service errors carry a code + numeric data; re-throw them as translated
 * messages the action client surfaces as `serverError`. Explicit `t` calls
 * per code keep next-intl's typed keys checkable.
 */
export async function withAudienceErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (!isAudienceError(error)) {
      throw error
    }
    const t = await getTranslations()
    const data = error.data ?? {}
    const messages = {
      audienceInvalidFile: () =>
        t("facebookMarketingMessages.audiences.errors.audienceInvalidFile"),
      audienceTooManyRows: () =>
        t("facebookMarketingMessages.audiences.errors.audienceTooManyRows", {
          max: Number(data.max ?? 0),
        }),
      audienceNoIdentifier: () =>
        t("facebookMarketingMessages.audiences.errors.audienceNoIdentifier"),
      audienceNoValidRows: () =>
        t("facebookMarketingMessages.audiences.errors.audienceNoValidRows"),
      audiencePartialUpload: () =>
        t("facebookMarketingMessages.audiences.errors.audiencePartialUpload", {
          received: Number(data.received ?? 0),
        }),
      audienceNotFound: () =>
        t("facebookMarketingMessages.audiences.errors.audienceNotFound"),
    } satisfies Record<typeof error.code, () => string>
    throw new ChatbotXException(messages[error.code]())
  }
}
```

- [ ] **Step 5: Write the actions**

Create `apps/builder/src/features/facebook-marketing-messages/actions/create-audience.action.ts`:

```ts
"use server"

import {
  facebookMarketingMessageAudienceService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { getMarketingMessagesAdAccounts } from "@chatbotx.io/integration-facebook-ads"
import { getTranslations } from "next-intl/server"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { withAudienceErrors } from "../lib/audience-errors"
import { requireValidGrant } from "../lib/grant"
import { customAudienceTosUrl, isCustomAudienceTosAccepted } from "../lib/tos"
import {
  type CreateAudienceInput,
  createAudienceSchema,
} from "../schema/audience"

/**
 * Server-side boundary (the client selects are conveniences): the ad account
 * must be visible to THIS grant with ToS accepted, and the Page must belong
 * to this workspace. Exported so the checks can be unit-tested.
 */
export async function createAudience({
  workspace,
  input,
}: {
  workspace: WorkspaceModel
  input: CreateAudienceInput
}) {
  const grant = await requireValidGrant(workspace)
  const t = await getTranslations()

  const accounts = await getMarketingMessagesAdAccounts(
    grant.accessToken,
    grant.version,
  )
  const account = accounts.find((row) => row.id === input.adAccountId)
  if (!account) {
    throw new ChatbotXException(t("facebookMarketingMessages.errors.notGranted"))
  }
  if (!isCustomAudienceTosAccepted(account.tosAccepted)) {
    throw new ChatbotXException(
      t("facebookMarketingMessages.errors.tosNotAccepted", {
        url: customAudienceTosUrl(account.accountId),
      }),
    )
  }

  const page = await messengerIntegrationService.findByPageId({
    workspaceId: workspace.id,
    pageId: input.pageId,
  })
  if (!page) {
    throw new ChatbotXException(
      t("facebookMarketingMessages.audiences.errors.pageNotConnected"),
    )
  }

  const buffer = Buffer.from(await input.file.arrayBuffer())
  return await withAudienceErrors(() =>
    facebookMarketingMessageAudienceService.create({
      workspaceId: workspace.id,
      grant: {
        accessToken: grant.accessToken,
        version: grant.version,
        facebookUserId: grant.facebookUserId,
      },
      adAccountId: input.adAccountId,
      pageId: input.pageId,
      name: input.name,
      description: input.description ? input.description : null,
      file: { fileName: input.file.name, buffer },
    }),
  )
}

export const createAudienceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAudienceSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
      parsedInput: CreateAudienceInput
    }) => await createAudience({ workspace: ctx.workspace, input: parsedInput }),
  )
```

Create `apps/builder/src/features/facebook-marketing-messages/actions/upload-more-audience.action.ts`:

```ts
"use server"

import { facebookMarketingMessageAudienceService } from "@chatbotx.io/business"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { withAudienceErrors } from "../lib/audience-errors"
import { requireValidGrant } from "../lib/grant"
import {
  type UploadMoreAudienceInput,
  uploadMoreAudienceSchema,
} from "../schema/audience"

export async function uploadMoreAudience({
  workspace,
  input,
}: {
  workspace: WorkspaceModel
  input: UploadMoreAudienceInput
}) {
  const grant = await requireValidGrant(workspace)
  const buffer = Buffer.from(await input.file.arrayBuffer())
  return await withAudienceErrors(() =>
    facebookMarketingMessageAudienceService.uploadMore({
      workspaceId: workspace.id,
      grant: {
        accessToken: grant.accessToken,
        version: grant.version,
        facebookUserId: grant.facebookUserId,
      },
      id: input.id,
      file: { fileName: input.file.name, buffer },
    }),
  )
}

export const uploadMoreAudienceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(uploadMoreAudienceSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
      parsedInput: UploadMoreAudienceInput
    }) =>
      await uploadMoreAudience({ workspace: ctx.workspace, input: parsedInput }),
  )
```

Create `apps/builder/src/features/facebook-marketing-messages/actions/delete-audience.action.ts`:

```ts
"use server"

import { facebookMarketingMessageAudienceService } from "@chatbotx.io/business"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { withAudienceErrors } from "../lib/audience-errors"
import { requireValidGrant } from "../lib/grant"
import { deleteAudienceSchema } from "../schema/audience"

/** Deletes on Meta first; the row goes only if Meta deleted it or it was already gone. */
export const deleteAudienceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteAudienceSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel; workspace: WorkspaceModel }
      parsedInput: { id: string }
    }) => {
      const grant = await requireValidGrant(ctx.workspace)
      await withAudienceErrors(() =>
        facebookMarketingMessageAudienceService.delete({
          workspaceId: ctx.workspace.id,
          grant: {
            accessToken: grant.accessToken,
            version: grant.version,
            facebookUserId: grant.facebookUserId,
          },
          id: parsedInput.id,
        }),
      )
    },
  )
```

- [ ] **Step 6: Add the oRPC procedures**

In `apps/builder/src/features/facebook-marketing-messages/api/private.ts`:

1. Change the business import to:

```ts
import {
  facebookMarketingMessageAudienceService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
```

2. Add schemas after `adAccountOptionSchema`:

```ts
const audienceRowSchema = z.object({
  id: z.string(),
  customAudienceId: z.string(),
  adAccountId: z.string(),
  pageId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  rowsUploaded: z.number(),
  readyAt: z.date().nullable(),
  createdAt: z.date(),
})

const audienceLiveStatusSchema = z.object({
  lower: z.number().nullable(),
  upper: z.number().nullable(),
  deliveryStatus: z
    .object({ code: z.number(), description: z.string() })
    .nullable(),
  ready: z.boolean(),
  missingOnMeta: z.boolean(),
  pageDisconnected: z.boolean(),
})
```

3. Add two procedures to `facebookMarketingMessagesAuthenticatedAPI`:

```ts
  listMarketingMessagesAudiencesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/audiences",
      summary: "List Marketing Messages custom audiences",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ audiences: z.array(audienceRowSchema) }))
    .handler(async ({ input }) => {
      const rows = await facebookMarketingMessageAudienceService.list(
        input.workspaceId,
      )
      return {
        audiences: rows.map((row) => ({
          id: row.id,
          customAudienceId: row.customAudienceId,
          adAccountId: row.adAccountId,
          pageId: row.pageId,
          name: row.name,
          description: row.description,
          rowsUploaded: row.rowsUploaded,
          readyAt: row.readyAt,
          createdAt: row.createdAt,
        })),
      }
    }),

  listMarketingMessagesAudiencesLiveAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-marketing-messages/audiences/live",
      summary: "Live count and status of Marketing Messages custom audiences",
      tags: ["FB Marketing Messages"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ statuses: z.record(z.string(), audienceLiveStatusSchema) }))
    .handler(async ({ context }) => {
      const grant = await requireValidGrant(context.workspace)
      return {
        statuses: await facebookMarketingMessageAudienceService.getLiveStatus({
          workspaceId: context.workspace.id,
          grant: {
            accessToken: grant.accessToken,
            version: grant.version,
            facebookUserId: grant.facebookUserId,
          },
        }),
      }
    }),
```

- [ ] **Step 7: Run tests and type-check**

Run: `pnpm --filter builder test -- marketing-messages-audience-actions`
Expected: PASS.
Run: `pnpm --filter builder check-types`
Expected: PASS (requires Task 8's keys for the typed `t` calls; if `en.d.json.ts` is stale, run `pnpm --filter builder dev` briefly or the next-intl type generation command the builder uses, then re-run).

- [ ] **Step 8: Commit**

```bash
git add apps/builder/src/features/facebook-marketing-messages/schema/audience.ts apps/builder/src/features/facebook-marketing-messages/lib/audience-errors.ts apps/builder/src/features/facebook-marketing-messages/actions/create-audience.action.ts apps/builder/src/features/facebook-marketing-messages/actions/upload-more-audience.action.ts apps/builder/src/features/facebook-marketing-messages/actions/delete-audience.action.ts apps/builder/src/features/facebook-marketing-messages/api/private.ts apps/builder/__tests__/marketing-messages-audience-actions.test.ts
git commit -m "feat(fb-marketing-messages): add custom audience actions and queries"
```

---

### Task 10: Tabs, audiences table, status helpers, delete dialog

**Files:**
- Create: `apps/builder/src/features/facebook-marketing-messages/lib/audience-status.ts`
- Create: `apps/builder/src/features/facebook-marketing-messages/lib/tab.ts`
- Create: `apps/builder/src/features/facebook-marketing-messages/hooks/use-audiences.ts`
- Create: `apps/builder/src/features/facebook-marketing-messages/components/marketing-messages-tabs.tsx`
- Create: `apps/builder/src/features/facebook-marketing-messages/components/audiences/audiences-table.tsx`
- Create: `apps/builder/src/features/facebook-marketing-messages/components/audiences/delete-audience-dialog.tsx`
- Modify: `apps/builder/src/features/facebook-marketing-messages/components/marketing-messages-view.tsx`
- Modify: `apps/builder/src/app/space/[workspaceId]/fb-marketing-messages/page.tsx`
- Test: `apps/builder/__tests__/marketing-messages-audience-status.test.ts`

**Interfaces:**
- Consumes: Task 9 oRPC procedures and `deleteAudienceAction`; Task 8 keys.
- Produces:
  - `lib/audience-status.ts`: `export type AudienceStatusView = { kind: "ready" } | { kind: "missing" } | { kind: "delivery"; description: string } | { kind: "none" }`; `export function resolveAudienceStatus(input: { readyAt: Date | null; live: AudienceLiveStatusLike | undefined }): AudienceStatusView`; `export function formatApproximateCount(lower: number | null | undefined, upper: number | null | undefined, locale?: string): string`. `AudienceLiveStatusLike = { ready: boolean; missingOnMeta: boolean; deliveryStatus: { code: number; description: string } | null }`.
  - `lib/tab.ts`: `export type MarketingMessagesTab = "campaigns" | "audiences"`; `export function parseMarketingMessagesTab(value: string | string[] | undefined): MarketingMessagesTab`.
  - `hooks/use-audiences.ts`: `useAudiences(workspaceId)`, `useAudiencesLive(workspaceId, enabled)`, `useInvalidateMarketingMessagesAudiences()`.
  - `AudiencesTable({ workspaceId, readOnly })` — Task 11 adds the create/upload-more dialog into it.

- [ ] **Step 1: Write the failing test**

Create `apps/builder/__tests__/marketing-messages-audience-status.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import {
  formatApproximateCount,
  resolveAudienceStatus,
} from "@/features/facebook-marketing-messages/lib/audience-status"
import { parseMarketingMessagesTab } from "@/features/facebook-marketing-messages/lib/tab"

const live = (overrides: Record<string, unknown> = {}) => ({
  ready: false,
  missingOnMeta: false,
  deliveryStatus: { code: 200, description: "Normal" },
  ...overrides,
})

describe("resolveAudienceStatus", () => {
  test("persisted readyAt wins even with no live data", () => {
    expect(resolveAudienceStatus({ readyAt: new Date(), live: undefined })).toEqual({
      kind: "ready",
    })
  })
  test("live ready", () => {
    expect(resolveAudienceStatus({ readyAt: null, live: live({ ready: true }) })).toEqual({
      kind: "ready",
    })
  })
  test("missing on Meta", () => {
    expect(
      resolveAudienceStatus({ readyAt: null, live: live({ missingOnMeta: true }) }),
    ).toEqual({ kind: "missing" })
  })
  test("non-200 delivery status shows Meta's description", () => {
    expect(
      resolveAudienceStatus({
        readyAt: null,
        live: live({ deliveryStatus: { code: 300, description: "Audience too small" } }),
      }),
    ).toEqual({ kind: "delivery", description: "Audience too small" })
  })
  test("200 delivery or no live data is empty", () => {
    expect(resolveAudienceStatus({ readyAt: null, live: live() })).toEqual({ kind: "none" })
    expect(resolveAudienceStatus({ readyAt: null, live: undefined })).toEqual({
      kind: "none",
    })
  })
})

describe("formatApproximateCount", () => {
  test("formats a range", () => {
    expect(formatApproximateCount(1000, 1200, "en-US")).toBe("1,000 – 1,200")
  })
  test("dash when a bound is missing or negative", () => {
    expect(formatApproximateCount(null, 1200, "en-US")).toBe("–")
    expect(formatApproximateCount(-1, -1, "en-US")).toBe("–")
    expect(formatApproximateCount(undefined, undefined, "en-US")).toBe("–")
  })
})

describe("parseMarketingMessagesTab", () => {
  test("defaults to campaigns", () => {
    expect(parseMarketingMessagesTab(undefined)).toBe("campaigns")
    expect(parseMarketingMessagesTab("bogus")).toBe("campaigns")
  })
  test("accepts audiences, including from an array param", () => {
    expect(parseMarketingMessagesTab("audiences")).toBe("audiences")
    expect(parseMarketingMessagesTab(["audiences", "x"])).toBe("audiences")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter builder test -- marketing-messages-audience-status`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the pure helpers**

Create `apps/builder/src/features/facebook-marketing-messages/lib/audience-status.ts`:

```ts
export type AudienceLiveStatusLike = {
  ready: boolean
  missingOnMeta: boolean
  deliveryStatus: { code: number; description: string } | null
}

export type AudienceStatusView =
  | { kind: "ready" }
  | { kind: "missing" }
  | { kind: "delivery"; description: string }
  | { kind: "none" }

const DELIVERY_OK = 200

/** Spec §4.4 status order: ready → missing on Meta → non-200 delivery → empty. */
export function resolveAudienceStatus(input: {
  readyAt: Date | null
  live: AudienceLiveStatusLike | undefined
}): AudienceStatusView {
  if (input.readyAt || input.live?.ready) {
    return { kind: "ready" }
  }
  if (input.live?.missingOnMeta) {
    return { kind: "missing" }
  }
  const delivery = input.live?.deliveryStatus
  if (delivery && delivery.code !== DELIVERY_OK) {
    return { kind: "delivery", description: delivery.description }
  }
  return { kind: "none" }
}

const isCount = (value: number | null | undefined): value is number =>
  typeof value === "number" && value >= 0

export function formatApproximateCount(
  lower: number | null | undefined,
  upper: number | null | undefined,
  locale?: string,
): string {
  if (!(isCount(lower) && isCount(upper))) {
    return "–"
  }
  const format = new Intl.NumberFormat(locale)
  return `${format.format(lower)} – ${format.format(upper)}`
}
```

Create `apps/builder/src/features/facebook-marketing-messages/lib/tab.ts`:

```ts
export type MarketingMessagesTab = "campaigns" | "audiences"

export function parseMarketingMessagesTab(
  value: string | string[] | undefined,
): MarketingMessagesTab {
  const first = Array.isArray(value) ? value[0] : value
  return first === "audiences" ? "audiences" : "campaigns"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter builder test -- marketing-messages-audience-status`
Expected: PASS.

- [ ] **Step 5: Write the query hooks**

Create `apps/builder/src/features/facebook-marketing-messages/hooks/use-audiences.ts`:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

const api = orpc.facebookMarketingMessagesAPI

export const useAudiences = (workspaceId: string) =>
  useQuery(
    api.listMarketingMessagesAudiencesAPI.queryOptions({
      input: { workspaceId },
      select: (res) => res.audiences,
    }),
  )

/** Disabled while the grant is expired — it can only fail then. */
export const useAudiencesLive = (workspaceId: string, enabled: boolean) =>
  useQuery(
    api.listMarketingMessagesAudiencesLiveAPI.queryOptions({
      input: { workspaceId },
      enabled,
      select: (res) => res.statuses,
    }),
  )

/** Call after create / upload more / delete (invariant 21). */
export const useInvalidateMarketingMessagesAudiences = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: api.listMarketingMessagesAudiencesAPI.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: api.listMarketingMessagesAudiencesLiveAPI.key(),
        }),
      ]),
    [queryClient],
  )
}
```

- [ ] **Step 6: Write the delete dialog**

Create `apps/builder/src/features/facebook-marketing-messages/components/audiences/delete-audience-dialog.tsx`:

```tsx
"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTransition } from "react"
import { toast } from "sonner"
import { deleteAudienceAction } from "../../actions/delete-audience.action"
import { useInvalidateMarketingMessagesAudiences } from "../../hooks/use-audiences"

export function DeleteAudienceDialog({
  workspaceId,
  audience,
  onOpenChange,
}: {
  workspaceId: string
  audience: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const invalidate = useInvalidateMarketingMessagesAudiences()
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!audience) {
      return
    }
    startTransition(async () => {
      const result = await deleteAudienceAction(workspaceId, { id: audience.id })
      if (result?.serverError) {
        toast.error(result.serverError)
        return
      }
      await invalidate()
      toast.success(t("facebookMarketingMessages.audiences.deleted"))
      onOpenChange(false)
    })
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={audience !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("facebookMarketingMessages.audiences.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("facebookMarketingMessages.audiences.deleteWarning", {
              name: audience?.name ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={handleDelete}>
            {isPending && <Loader2Icon className="size-4 animate-spin" />}
            {t("actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 7: Write the audiences table**

Create `apps/builder/src/features/facebook-marketing-messages/components/audiences/audiences-table.tsx`:

```tsx
"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { Trash2Icon, UploadIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { orpc } from "@/lib/orpc/query"
import { useAudiences, useAudiencesLive } from "../../hooks/use-audiences"
import {
  formatApproximateCount,
  resolveAudienceStatus,
} from "../../lib/audience-status"
import { DeleteAudienceDialog } from "./delete-audience-dialog"

type AudienceRow = NonNullable<ReturnType<typeof useAudiences>["data"]>[number]

export function AudiencesTable({
  workspaceId,
  readOnly = false,
}: {
  workspaceId: string
  readOnly?: boolean
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [pendingDelete, setPendingDelete] = useState<AudienceRow | null>(null)
  // Task 11 wires these into CreateAudienceDialog.
  const [uploadMoreFor, setUploadMoreFor] = useState<AudienceRow | null>(null)

  const audiences = useAudiences(workspaceId)
  const live = useAudiencesLive(workspaceId, !readOnly)

  const pages = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesPagesAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )
  const pageNameById = useMemo(
    () => new Map((pages.data?.pages ?? []).map((p) => [p.pageId, p.name])),
    [pages.data],
  )
  const adAccounts = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesAdAccountsAPI.queryOptions(
      { input: { workspaceId }, enabled: !readOnly },
    ),
  )
  const adAccountNameById = useMemo(
    () =>
      new Map((adAccounts.data?.accounts ?? []).map((a) => [a.id, a.name])),
    [adAccounts.data],
  )

  const columns = useMemo<ColumnDef<AudienceRow>[]>(() => {
    // Name/count/status come from async queries, so they resolve in `cell`
    // — TanStack caches accessor results per row (see MarketingMessagesTable).
    const statusCell = (row: AudienceRow) => {
      const liveStatus = live.data?.[row.customAudienceId]
      const view = resolveAudienceStatus({ readyAt: row.readyAt, live: liveStatus })
      return (
        <div className="flex flex-col gap-1">
          {view.kind === "ready" && (
            <Badge variant="default">
              {t("facebookMarketingMessages.audiences.status.ready")}
            </Badge>
          )}
          {view.kind === "missing" && (
            <Badge variant="destructive">
              {t("facebookMarketingMessages.audiences.status.missing")}
            </Badge>
          )}
          {view.kind === "delivery" && (
            <span className="text-sm">{view.description}</span>
          )}
          {liveStatus?.pageDisconnected && (
            <span className="text-muted-foreground text-xs">
              {t("facebookMarketingMessages.audiences.pageDisconnected")}
            </span>
          )}
        </div>
      )
    }

    const base: ColumnDef<AudienceRow>[] = [
      {
        accessorKey: "customAudienceId",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.audiences.fields.customAudienceId")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.customAudienceId}</span>
        ),
      },
      {
        accessorKey: "pageId",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.fields.page")}
          />
        ),
        cell: ({ row }) =>
          pageNameById.get(row.original.pageId) ?? row.original.pageId,
      },
      {
        accessorKey: "adAccountId",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.fields.adAccount")}
          />
        ),
        cell: ({ row }) =>
          adAccountNameById.get(row.original.adAccountId) ??
          row.original.adAccountId,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("fields.name.label")} />
        ),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "description",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.audiences.fields.description")}
          />
        ),
        cell: ({ row }) => row.original.description ?? "",
        enableSorting: false,
      },
      {
        id: "approximateCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.audiences.fields.approximateCount")}
          />
        ),
        cell: ({ row }) => {
          const liveStatus = live.data?.[row.original.customAudienceId]
          return formatApproximateCount(liveStatus?.lower, liveStatus?.upper, locale)
        },
        enableSorting: false,
      },
      {
        id: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.audiences.fields.status")}
          />
        ),
        cell: ({ row }) => statusCell(row.original),
        enableSorting: false,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("fields.createdAt.label")} />
        ),
        cell: ({ row }) => row.original.createdAt.toLocaleDateString(),
      },
    ]

    if (readOnly) {
      return base
    }

    return [
      ...base,
      {
        id: "actions",
        size: 10,
        header: ({ column }) => <DataTableColumnHeader column={column} title="" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              onClick={() => setUploadMoreFor(row.original)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <UploadIcon className="size-4" />
              <span className="sr-only">
                {t("facebookMarketingMessages.audiences.uploadMore")}
              </span>
            </Button>
            <Button
              onClick={() => setPendingDelete(row.original)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-4" />
              <span className="sr-only">{t("actions.delete")}</span>
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ]
  }, [t, locale, readOnly, live.data, pageNameById, adAccountNameById])

  const { table } = useDataTable({
    data: audiences.data ?? [],
    columns,
    pageCount: -1,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (row) => row.id,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("facebookMarketingMessages.audiences.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            {/* Task 11: Create New button + CreateAudienceDialog go here. */}
          </DataTableToolbar>
        </DataTable>
        <DeleteAudienceDialog
          audience={pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
```

> `uploadMoreFor` is intentionally unused until Task 11; if Biome flags it, prefix with `_` for this commit only — Task 11 replaces it.

> If `useDataTable` requires `data` to be stable, wrap `audiences.data ?? []` in `useMemo`.

- [ ] **Step 8: Write the tab switcher and wire the page**

Create `apps/builder/src/features/facebook-marketing-messages/components/marketing-messages-tabs.tsx`:

```tsx
"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import type { MarketingMessagesTab } from "../lib/tab"

export function MarketingMessagesTabs({
  tab,
  campaigns,
  audiences,
}: {
  tab: MarketingMessagesTab
  campaigns: ReactNode
  audiences: ReactNode
}) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const onValueChange = (value: unknown) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "audiences") {
      params.set("tab", "audiences")
    } else {
      params.delete("tab")
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <Tabs onValueChange={onValueChange} value={tab}>
      <TabsList>
        <TabsTrigger value="campaigns">
          {t("facebookMarketingMessages.tabs.campaigns")}
        </TabsTrigger>
        <TabsTrigger value="audiences">
          {t("facebookMarketingMessages.tabs.audiences")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="campaigns">{campaigns}</TabsContent>
      <TabsContent value="audiences">{audiences}</TabsContent>
    </Tabs>
  )
}
```

Replace `apps/builder/src/features/facebook-marketing-messages/components/marketing-messages-view.tsx` with:

```tsx
"use client"

import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
import type { MarketingMessagesGrant } from "../lib/grant"
import type { MarketingMessagesTab } from "../lib/tab"
import { AudiencesTable } from "./audiences/audiences-table"
import { GrantPanel } from "./grant-panel"
import { MarketingMessagesTable } from "./marketing-messages-table"
import { MarketingMessagesTabs } from "./marketing-messages-tabs"

export function MarketingMessagesView({
  workspaceId,
  grantState,
  rows,
  tab,
}: {
  workspaceId: string
  grantState: MarketingMessagesGrant["state"]
  rows: FacebookMarketingMessageModel[]
  tab: MarketingMessagesTab
}) {
  if (grantState === "missing") {
    return <GrantPanel state="missing" workspaceId={workspaceId} />
  }

  const readOnly = grantState === "expired"
  return (
    <div className="flex flex-col gap-4">
      {readOnly && <GrantPanel state="expired" workspaceId={workspaceId} />}
      <MarketingMessagesTabs
        audiences={<AudiencesTable readOnly={readOnly} workspaceId={workspaceId} />}
        campaigns={
          <MarketingMessagesTable
            readOnly={readOnly}
            rows={rows}
            workspaceId={workspaceId}
          />
        }
        tab={tab}
      />
    </div>
  )
}
```

In `apps/builder/src/app/space/[workspaceId]/fb-marketing-messages/page.tsx`:

1. Add `import { parseMarketingMessagesTab } from "@/features/facebook-marketing-messages/lib/tab"`.
2. Change the props to:

```tsx
export default async function FacebookMarketingMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}) {
```

3. After resolving `workspaceId`, add `const tab = parseMarketingMessagesTab((await searchParams).tab)`.
4. Pass `tab={tab}` to `<MarketingMessagesView … />`.

- [ ] **Step 9: Verify**

Run: `pnpm --filter builder test -- marketing-messages`
Expected: PASS (all marketing-messages builder tests, existing ones included).
Run: `pnpm --filter builder check-types`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/builder/src/features/facebook-marketing-messages/lib/audience-status.ts apps/builder/src/features/facebook-marketing-messages/lib/tab.ts apps/builder/src/features/facebook-marketing-messages/hooks/use-audiences.ts apps/builder/src/features/facebook-marketing-messages/components/marketing-messages-tabs.tsx apps/builder/src/features/facebook-marketing-messages/components/audiences/audiences-table.tsx apps/builder/src/features/facebook-marketing-messages/components/audiences/delete-audience-dialog.tsx apps/builder/src/features/facebook-marketing-messages/components/marketing-messages-view.tsx "apps/builder/src/app/space/[workspaceId]/fb-marketing-messages/page.tsx" apps/builder/__tests__/marketing-messages-audience-status.test.ts
git commit -m "feat(fb-marketing-messages): add audiences tab with live status table"
```

---

### Task 11: Create / upload-more wizard dialog

**Files:**
- Create: `apps/builder/src/features/facebook-marketing-messages/components/audiences/step-prepare.tsx`
- Create: `apps/builder/src/features/facebook-marketing-messages/components/audiences/step-upload.tsx`
- Create: `apps/builder/src/features/facebook-marketing-messages/components/audiences/step-confirm.tsx`
- Create: `apps/builder/src/features/facebook-marketing-messages/components/audiences/create-audience-dialog.tsx`
- Modify: `apps/builder/src/features/facebook-marketing-messages/components/audiences/audiences-table.tsx`

**Interfaces:**
- Consumes: Task 9 `createAudienceAction`, `uploadMoreAudienceAction`, `createAudienceSchema`, `uploadMoreAudienceSchema`, `AUDIENCE_*` constants; Task 10 `useInvalidateMarketingMessagesAudiences`; `AudienceUploadResult` type from `@chatbotx.io/business` (type-only import).
- Produces: `CreateAudienceDialog({ workspaceId, open, onOpenChange, target })` where `target: { id: string; name: string; adAccountId: string; pageId: string } | null` (`null` = create mode).

- [ ] **Step 1: Step 1 component (prepare list)**

Create `step-prepare.tsx`:

```tsx
"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"

const ABOUT_HASHING_URL = "https://www.facebook.com/business/help/112061095610075"
const TEMPLATE_URL = "/templates/marketing-messages-audience.csv"
const MAIN = ["email", "phone"] as const
const MORE = ["madid", "fn", "ln", "ct", "st", "country", "zip", "dob", "doby", "gen"] as const

export function StepPrepare({ onNext }: { onNext: () => void }) {
  const t = useTranslations("facebookMarketingMessages.audiences.wizard")

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {t("prepareDescription")}{" "}
        <a
          className="text-primary underline"
          href={ABOUT_HASHING_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("aboutHashing")}
        </a>
      </p>
      <div>
        <Button
          nativeButton={false}
          render={
            <a download href={TEMPLATE_URL}>
              <DownloadIcon className="size-4" />
              {t("downloadTemplate")}
            </a>
          }
          size="sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm">{t("mainIdentifiers")}</p>
        <div className="flex flex-wrap gap-2">
          {MAIN.map((key) => (
            <Badge key={key} variant="outline">
              {t(`identifiers.${key}`)}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm">{t("moreIdentifiers")}</p>
        <div className="flex flex-wrap gap-2">
          {MORE.map((key) => (
            <Badge key={key} variant="outline">
              {t(`identifiers.${key}`)}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={onNext} type="button">
          {t("next")}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Step 3 component (confirm)**

Create `step-confirm.tsx`:

```tsx
"use client"

import type { AudienceUploadResult } from "@chatbotx.io/business"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { CheckIcon, InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export function StepConfirm({
  result,
  onDone,
}: {
  result: AudienceUploadResult
  onDone: () => void
}) {
  const t = useTranslations("facebookMarketingMessages.audiences.wizard")

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-green-100">
        <div className="flex size-9 items-center justify-center rounded-full bg-green-500 text-white">
          <CheckIcon className="size-5" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{t("successTitle")}</p>
        <p className="text-muted-foreground text-sm">
          {t("successRows", { count: result.received })}
        </p>
        {result.skipped > 0 && (
          <p className="text-muted-foreground text-sm">
            {t("skippedRows", { count: result.skipped })}
          </p>
        )}
        {result.invalid > 0 && (
          <p className="text-muted-foreground text-sm">
            {t("invalidRows", { count: result.invalid })}
          </p>
        )}
      </div>
      <Alert className="text-left">
        <InfoIcon className="size-4" />
        <AlertDescription>{t("matchingNote")}</AlertDescription>
      </Alert>
      <Button onClick={onDone} type="button">
        {t("done")}
      </Button>
    </div>
  )
}
```

> `import type` from `@chatbotx.io/business` is erased at compile time, so no server code reaches the client bundle. If the bundler or lint rule still objects, declare a local `type AudienceUploadResult = { id: string; customAudienceId: string; received: number; skipped: number; invalid: number }` instead.

- [ ] **Step 3: Step 2 component (upload form)**

Create `step-upload.tsx`. One component, two schemas: create mode uses `createAudienceAction` + `createAudienceSchema`; append mode uses `uploadMoreAudienceAction` + `uploadMoreAudienceSchema` and shows the locked target read-only.

```tsx
"use client"

import type { AudienceUploadResult } from "@chatbotx.io/business"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useQuery } from "@tanstack/react-query"
import { FileSpreadsheetIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useWatch } from "react-hook-form"
import { orpc } from "@/lib/orpc/query"
import { createAudienceAction } from "../../actions/create-audience.action"
import { uploadMoreAudienceAction } from "../../actions/upload-more-audience.action"
import {
  AUDIENCE_ACCEPT_ATTRIBUTE,
  AUDIENCE_DESCRIPTION_MAX,
  AUDIENCE_NAME_MAX,
  createAudienceSchema,
  uploadMoreAudienceSchema,
} from "../../schema/audience"

export type UploadTarget = {
  id: string
  name: string
  adAccountId: string
  pageId: string
}

type Props = {
  workspaceId: string
  target: UploadTarget | null
  onBack: () => void
  onPendingChange: (pending: boolean) => void
  onUploaded: (result: AudienceUploadResult) => void
}

/** Shared file picker: native input styled as a dashed drop zone. */
function FileDropField({ name }: { name: "file" }) {
  const t = useTranslations("facebookMarketingMessages.audiences")
  const tWizard = useTranslations("facebookMarketingMessages.audiences.wizard")
  const [dragOver, setDragOver] = useState(false)

  return (
    <FormField
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{t("fields.file")}</FormLabel>
          <FormControl>
            <label
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center ${dragOver ? "bg-muted" : ""}`}
              onDragLeave={() => setDragOver(false)}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(false)
                const file = event.dataTransfer.files[0]
                if (file) {
                  field.onChange(file)
                }
              }}
            >
              <FileSpreadsheetIcon className="size-6" />
              <span className="text-sm">
                {field.value instanceof File ? field.value.name : tWizard("dropzone")}
              </span>
              <span className="text-muted-foreground text-xs">
                {tWizard("maxFileSize")}
              </span>
              <input
                accept={AUDIENCE_ACCEPT_ATTRIBUTE}
                className="sr-only"
                onChange={(event) => field.onChange(event.target.files?.[0])}
                type="file"
              />
            </label>
          </FormControl>
          {/* Schema messages are wizard i18n keys (see schema/audience.ts). */}
          {fieldState.error?.message ? (
            <p className="text-destructive text-sm">
              {tWizard(fieldState.error.message as "fileRequired")}
            </p>
          ) : (
            <FormMessage />
          )}
        </FormItem>
      )}
    />
  )
}

function CreateForm({ workspaceId, onBack, onPendingChange, onUploaded }: Props) {
  const t = useTranslations()
  const tWizard = useTranslations("facebookMarketingMessages.audiences.wizard")
  const [serverError, setServerError] = useState<string | null>(null)

  const pages = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesPagesAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )
  const adAccounts = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesAdAccountsAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )

  const { form, handleSubmitWithAction, action } = useHookFormAction(
    createAudienceAction.bind(null, workspaceId),
    zodResolver(createAudienceSchema),
    {
      actionProps: {
        onExecute: () => {
          setServerError(null)
          onPendingChange(true)
        },
        onSettled: () => onPendingChange(false),
        onSuccess: ({ data }) => data && onUploaded(data),
        onError: ({ error }) => setServerError(error.serverError ?? null),
      },
      formProps: {
        mode: "onChange",
        defaultValues: { adAccountId: "", pageId: "", name: "", description: "" },
      },
    },
  )

  const selectedAccountId = useWatch({ control: form.control, name: "adAccountId" })
  const selectedAccount = adAccounts.data?.accounts.find(
    (account) => account.id === selectedAccountId,
  )
  const tosBlocked = Boolean(selectedAccount && !selectedAccount.tosAccepted)

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <p className="text-muted-foreground text-sm">{tWizard("uploadNote")}</p>
        <SelectField
          label={t("facebookMarketingMessages.fields.adAccount")}
          name="adAccountId"
          options={(adAccounts.data?.accounts ?? []).map((account) => ({
            value: account.id,
            label: account.name,
          }))}
          required
        />
        {tosBlocked && selectedAccount && (
          <Alert variant="destructive">
            <AlertDescription>
              <a
                className="underline"
                href={selectedAccount.tosUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("facebookMarketingMessages.errors.tosNotAccepted", {
                  url: selectedAccount.tosUrl,
                })}
              </a>
            </AlertDescription>
          </Alert>
        )}
        <SelectField
          label={t("facebookMarketingMessages.fields.page")}
          name="pageId"
          options={(pages.data?.pages ?? []).map((page) => ({
            value: page.pageId,
            label: page.name,
          }))}
          required
        />
        <InputField
          label={t("fields.name.label")}
          maxLength={AUDIENCE_NAME_MAX}
          name="name"
          placeholder={tWizard("namePlaceholder")}
          required
        />
        <TextareaField
          label={t("facebookMarketingMessages.audiences.fields.description")}
          maxLength={AUDIENCE_DESCRIPTION_MAX}
          name="description"
          placeholder={tWizard("descriptionPlaceholder")}
        />
        <FileDropField name="file" />
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-between">
          <Button
            disabled={action.isPending}
            onClick={onBack}
            type="button"
            variant="outline"
          >
            {tWizard("back")}
          </Button>
          <Button disabled={action.isPending || tosBlocked} type="submit">
            {action.isPending && <Loader2Icon className="size-4 animate-spin" />}
            {tWizard("upload")}
          </Button>
        </div>
      </form>
    </Form>
  )
}

function AppendForm({
  workspaceId,
  target,
  onBack,
  onPendingChange,
  onUploaded,
}: Props & { target: UploadTarget }) {
  const t = useTranslations()
  const tWizard = useTranslations("facebookMarketingMessages.audiences.wizard")
  const [serverError, setServerError] = useState<string | null>(null)

  const { form, handleSubmitWithAction, action } = useHookFormAction(
    uploadMoreAudienceAction.bind(null, workspaceId),
    zodResolver(uploadMoreAudienceSchema),
    {
      actionProps: {
        onExecute: () => {
          setServerError(null)
          onPendingChange(true)
        },
        onSettled: () => onPendingChange(false),
        onSuccess: ({ data }) => data && onUploaded(data),
        onError: ({ error }) => setServerError(error.serverError ?? null),
      },
      formProps: { mode: "onChange", defaultValues: { id: target.id } },
    },
  )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <p className="text-muted-foreground text-sm">{tWizard("uploadNote")}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("fields.name.label")}</dt>
          <dd>{target.name}</dd>
          <dt className="text-muted-foreground">
            {t("facebookMarketingMessages.fields.adAccount")}
          </dt>
          <dd>{target.adAccountId}</dd>
          <dt className="text-muted-foreground">
            {t("facebookMarketingMessages.fields.page")}
          </dt>
          <dd>{target.pageId}</dd>
        </dl>
        <FileDropField name="file" />
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-between">
          <Button
            disabled={action.isPending}
            onClick={onBack}
            type="button"
            variant="outline"
          >
            {tWizard("back")}
          </Button>
          <Button disabled={action.isPending} type="submit">
            {action.isPending && <Loader2Icon className="size-4 animate-spin" />}
            {tWizard("upload")}
          </Button>
        </div>
      </form>
    </Form>
  )
}

export function StepUpload(props: Props) {
  return props.target ? (
    <AppendForm {...props} target={props.target} />
  ) : (
    <CreateForm {...props} />
  )
}
```

> Check `SelectField`, `InputField`, `TextareaField` prop names (`placeholder`, `maxLength`, `required`) against `packages/ui/src/components/form/*.tsx`; the campaign form (`marketing-message-form.tsx`) uses `label`, `name`, `options`, `required`, `maxLength`. Drop any prop a field component does not accept.

- [ ] **Step 4: The dialog**

Create `create-audience-dialog.tsx`:

```tsx
"use client"

import type { AudienceUploadResult } from "@chatbotx.io/business"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useInvalidateMarketingMessagesAudiences } from "../../hooks/use-audiences"
import { StepConfirm } from "./step-confirm"
import { StepPrepare } from "./step-prepare"
import { StepUpload, type UploadTarget } from "./step-upload"

const STEPS = ["prepare", "upload", "confirm"] as const
type Step = (typeof STEPS)[number]

export function CreateAudienceDialog({
  workspaceId,
  open,
  onOpenChange,
  target,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` = create a new audience; otherwise append rows to it. */
  target: UploadTarget | null
}) {
  const t = useTranslations("facebookMarketingMessages.audiences.wizard")
  const invalidate = useInvalidateMarketingMessagesAudiences()
  const [step, setStep] = useState<Step>("prepare")
  const [result, setResult] = useState<AudienceUploadResult | null>(null)
  const [pending, setPending] = useState(false)

  const close = (next: boolean) => {
    if (next) {
      onOpenChange(true)
      return
    }
    // Never dismiss mid-upload — the request would keep running unseen.
    if (pending) {
      return
    }
    setStep("prepare")
    setResult(null)
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{target ? t("uploadMoreTitle") : t("title")}</DialogTitle>
        </DialogHeader>
        <ol className="flex items-center gap-2 text-sm">
          {STEPS.map((key, index) => (
            <li
              className={cn(
                "flex items-center gap-2",
                key === step ? "font-semibold" : "text-muted-foreground",
              )}
              key={key}
            >
              <span className="flex size-6 items-center justify-center rounded-full border">
                {index + 1}
              </span>
              {t(`steps.${key}`)}
            </li>
          ))}
        </ol>
        {step === "prepare" && <StepPrepare onNext={() => setStep("upload")} />}
        {step === "upload" && (
          <StepUpload
            onBack={() => setStep("prepare")}
            onPendingChange={setPending}
            onUploaded={async (uploaded) => {
              setResult(uploaded)
              setStep("confirm")
              await invalidate()
            }}
            target={target}
            workspaceId={workspaceId}
          />
        )}
        {step === "confirm" && result && (
          <StepConfirm onDone={() => close(false)} result={result} />
        )}
      </DialogContent>
    </Dialog>
  )
}
```

> The partial-upload error also needs an invalidation (the row now exists). In `StepUpload`'s `onError` handlers, call an `onFailed` prop that the dialog wires to `invalidate()`. Add `onFailed: () => void` to `Props`, call it in both forms' `onError`, and pass `onFailed={() => invalidate()}` from the dialog.

- [ ] **Step 5: Wire the dialog into the table**

In `audiences-table.tsx`:

1. Import: `import { PlusIcon } from "lucide-react"` (add to the existing lucide import) and `import { CreateAudienceDialog } from "./create-audience-dialog"`.
2. Add state: `const [createOpen, setCreateOpen] = useState(false)`.
3. Replace the toolbar placeholder comment with:

```tsx
{!readOnly && (
  <Button onClick={() => setCreateOpen(true)} size="sm" type="button">
    <PlusIcon className="size-4" />
    {t("facebookMarketingMessages.audiences.create")}
  </Button>
)}
```

4. After `<DeleteAudienceDialog … />` add:

```tsx
<CreateAudienceDialog
  onOpenChange={(open) => {
    if (!open) {
      setCreateOpen(false)
      setUploadMoreFor(null)
    }
  }}
  open={createOpen || uploadMoreFor !== null}
  target={
    uploadMoreFor
      ? {
          id: uploadMoreFor.id,
          name: uploadMoreFor.name,
          adAccountId:
            adAccountNameById.get(uploadMoreFor.adAccountId) ??
            uploadMoreFor.adAccountId,
          pageId: pageNameById.get(uploadMoreFor.pageId) ?? uploadMoreFor.pageId,
        }
      : null
  }
  workspaceId={workspaceId}
/>
```

(The append form only displays `adAccountId`/`pageId`, so passing the resolved names is intentional.)

5. Remove any `_` prefix added to `uploadMoreFor` in Task 10.

- [ ] **Step 6: Verify in the running app**

Run: `pnpm --filter builder check-types && pnpm --filter builder test -- marketing-messages`
Expected: PASS.

Then use the `run` skill (or `pnpm --filter builder dev`) and in a workspace with a valid Marketing Messages grant:
1. `/space/<id>/fb-marketing-messages` shows Campaigns; switching to Audiences sets `?tab=audiences`; refresh keeps the tab.
2. Create New → Step 1 shows copy, link, template download (file downloads with 12 columns), chips.
3. Step 2 with an ad account whose ToS is not accepted shows the alert and disables Upload.
4. Upload the template → Step 3 shows "uploaded 9 rows"; Done closes; the row appears with an id and status from Meta.
5. Upload a `.xls` → inline "must be .csv, .txt or .xlsx" error, no request.
6. Upload more on the row → Step 2 shows locked target; upload succeeds.
7. Delete → confirm → row disappears.

> Per memory "Local dev cloud edition blocks actions": if every action throws "Trial expired" locally, the dev workspace needs a plan status — fix the local data, not the code.

- [ ] **Step 7: Commit**

```bash
git add apps/builder/src/features/facebook-marketing-messages/components/audiences/step-prepare.tsx apps/builder/src/features/facebook-marketing-messages/components/audiences/step-upload.tsx apps/builder/src/features/facebook-marketing-messages/components/audiences/step-confirm.tsx apps/builder/src/features/facebook-marketing-messages/components/audiences/create-audience-dialog.tsx apps/builder/src/features/facebook-marketing-messages/components/audiences/audiences-table.tsx
git commit -m "feat(fb-marketing-messages): add custom audience creation wizard"
```

---

### Task 12: Final gate

**Files:** none new.

- [ ] **Step 1: Lint and auto-fix**

Run: `pnpm fix` then `pnpm lint`
Expected: PASS (includes `check:agent-instructions`, `i18n-check`, Biome, and `db:check-drift`).

- [ ] **Step 2: Type-check every touched workspace**

```bash
pnpm --filter @chatbotx.io/imports check-types
pnpm --filter @chatbotx.io/integration-facebook-ads check-types
pnpm --filter @chatbotx.io/database check-types
pnpm --filter @chatbotx.io/business check-types
pnpm --filter builder check-types
```

Expected: all PASS.

- [ ] **Step 3: Tests**

```bash
pnpm --filter @chatbotx.io/imports test
pnpm --filter @chatbotx.io/integration-facebook-ads test
pnpm --filter @chatbotx.io/database test
pnpm --filter @chatbotx.io/business test
pnpm --filter builder test
```

Expected: all PASS.

- [ ] **Step 4: Edge-graph check (D25)**

Run: `grep -rn "customer-file" apps/builder/src`
Expected: no hits — the builder never imports the `node:crypto` module directly; only `packages/business` does.

- [ ] **Step 5: Invariant review**

Dispatch the `invariant-guard` agent on the branch diff. Fix every reported violation and commit the fixes with a `fix(...)` message.

- [ ] **Step 6: Report**

Report to the user: test/lint results, the migration SQL from Task 5 (still unapplied), and anything skipped.
