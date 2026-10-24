# FB Marketing Messages — Custom Audience tab

> Status: DESIGN — awaiting written-spec approval before planning.
> Date: 2026-10-04

## 1. Goal

Let a workspace build a Messenger **Marketing Messages Custom Audience** from a
subscriber file (CSV/TXT/XLSX/XLS) and track whether Meta has matched it and
issued subscription tokens.

The `fb-marketing-messages` page gains two tabs:

- **Campaigns** — today's page, unchanged.
- **Audiences** — new: a table of audiences created through ChatbotX, a
  3-step creation wizard, "Upload more rows", and delete.

Success: a user uploads the template file, sees "uploaded N rows", and the
audience later shows **Ready** in the table once Meta issues subscription
tokens.

### Out of scope

- Targeting a campaign at an audience (later spec).
- The `marketing_messages_subscriber_upload_status` webhook.
- A column-mapping UI.
- Editing an audience's name/description.
- Storing the uploaded file.
- Listing Marketing Messages audiences created outside ChatbotX.

## 2. Meta API reference

| Purpose | Call |
|---|---|
| Create audience | `POST /act_<AD_ACCOUNT_ID>/customaudiences` with `subtype: "CUSTOM"`, `customer_file_source: "USER_PROVIDED_ONLY"`, `name`, `description`, `use_for_products: ["MARKETING_MESSAGES"]`, `subscription_info: ["MESSENGER"]`, `marketing_message_channels: { "MESSENGER": "<PAGE_ID>" }` |
| Upload users | `POST /<CUSTOM_AUDIENCE_ID>/users` with `payload: { schema, data }`, `session: { session_id, batch_seq, last_batch_flag, estimated_num_total }`; max 10,000 rows per request. Response: `num_received`, `num_invalid_entries`, `invalid_entry_samples` |
| List / live status | `GET /act_<AD_ACCOUNT_ID>/customaudiences?fields=id,name,description,subtype,delivery_status,operation_status,approximate_count_lower_bound,approximate_count_upper_bound,messenger_marketing_messages_page&limit=499&filtering=[{"field":"data_source.subtype","operator":"IN","value":[1010]}]` |
| Ready check | `GET /<PAGE_ID>/notification_message_tokens?custom_audience_ids=<ID>&limit=1` with the Page access token |
| Delete | `DELETE /<CUSTOM_AUDIENCE_ID>` |

Docs:

- Grow audience — <https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/grow-marketing-messages-audience>
- Subscription tokens — <https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/get-subscription-tokens>
- Hashing/normalization — <https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/guides/custom-audiences#hash>
- Users endpoint — <https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/custom-audience/users>

Facts the design relies on:

- Every row must contain EMAIL or PHONE; other customer-file keys
  (FN, LN, CT, ST, ZIP, COUNTRY, DOBY, DOBM, DOBD, GEN, MADID) are optional
  multi-keys.
- All values are SHA-256 hashed except MADID.
- Tokens are only returned once ≥100 users match; matching can take up to 24h.
- The schema must stay identical across all batches in a session.

## 3. Decisions

| # | Decision |
|---|---|
| D1 | Step 2 has a **Page** select (connected Messenger integrations); the table shows a Page column. |
| D2 | Audiences are **persisted in our DB**; count and delivery status are fetched live from Meta. Only audiences created via ChatbotX are listed. |
| D3 | Supported identifiers: EMAIL, PHONE (one required) + FN, LN, CT, ST, ZIP, COUNTRY, DOB (→ DOBY/DOBM/DOBD), DOBY, GEN, MADID. Age and App/Page/Instagram-scoped IDs are not supported. |
| D4 | Parse, normalize, hash, and upload **synchronously in a server action** (`bodySizeLimit` is already `20mb`). |
| D5 | Limits: **20 MB** file, **100,000** data rows. |
| D6 | Phone: `normalizePhoneNumber(raw, row.COUNTRY)`; fallback digits-only with leading zeros removed; a raw value starting with `0` and no country → invalid. Row kept if it has a valid email. |
| D7 | Formats: `.csv`, `.txt`, `.xlsx`. Header row required. Legacy `.xls` is **not** accepted — the shared `exceljs` parser cannot read it (amended 2026-10-04). |
| D8 | Headers matched case/space/underscore-insensitively against template names plus aliases; unknown columns ignored. |
| D9 | Validate the whole file **before** creating anything on Meta. If the upload fails after creation, keep the row with the partial count and return an error. |
| D10 | Row actions: **Delete** (Meta + DB) and **Upload more rows**. |
| D11 | Tabs via `?tab=campaigns|audiences` (default `campaigns`). |
| D12 | Ready check runs live on list load, only for rows with `readyAt IS NULL`; once ready, `readyAt` is persisted and the check is skipped forever after. |
| D13 | Approximate count shown as `lower – upper`. |
| D14 | Expired grant: DB rows shown read-only; count/status show `–`; Create/Delete/Upload more hidden. |
| D15 | Page disconnected: skip ready check, status falls back to `delivery_status`, plus a "Page disconnected" hint. |
| D16 | Wizard is a **dialog** over the list. |
| D17 | Step 3 reports uploaded (`num_received`), skipped (no valid email/phone), and Meta-invalid counts (latter two only when > 0). |
| D18 | The uploaded file is discarded after hashing; plain PII is never stored or logged. |
| D19 | Ad-account ToS handling reuses the campaign behavior (disabled option + "Accept terms" link; server re-checks). |
| D20 | Template: the user-provided `example_audience_file.csv` **with `age` and `uid` columns removed**, served statically. |
| D21 | Names/city normalized per Meta: trim, lowercase, strip punctuation and digits, keep Unicode letters. |
| D22 | DOB accepts `MM/DD/YY`, `MM/DD/YYYY`, `YYYY-MM-DD`; a 2-digit year greater than the current 2-digit year maps to 19xx, otherwise 20xx. An explicit `doby` column wins over DOB's year. Invalid → blank. |
| D23 | An audience in our DB but absent from Meta's list shows status **"Deleted on Meta"**. |
| D24 | The shared XLSX parser's hardcoded caps (10,000 rows / 10 MB compressed) become an optional `limits` argument; defaults unchanged for existing imports; the audience upload passes 100,000 rows / 20 MB. |
| D25 | Hashing in `customer-file/` uses synchronous `node:crypto` SHA-256 (100k rows × 13 keys is too slow through async Web Crypto). The module is exposed via its own package export `@chatbotx.io/integration-facebook-ads/customer-file` and is **not** re-exported from the package root, so the builder's edge/middleware graph never pulls `node:crypto`. |
| D26 | Meta's create response is accepted as either `{ id }` or `{ data: [{ id }] }` (the guide shows the latter, the Graph default is the former). |

## 4. Architecture

Approach A — layered, reusing existing helpers. The chain is
`action | oRPC handler → service → repository → DB`, with Graph calls in the
integration package.

```
apps/builder (feature: facebook-marketing-messages)
  page.tsx  ── Tabs (?tab) ──► Campaigns: MarketingMessagesTable (unchanged)
                             └► Audiences: AudiencesTable + CreateAudienceDialog
  actions/  create-audience.action.ts, upload-more-audience.action.ts,
            delete-audience.action.ts
  api/      listMarketingMessagesAudiencesAPI, listMarketingMessagesAudiencesLiveAPI
        │
        ▼
packages/business
  facebookMarketingMessageAudienceService
    create / uploadMore / list / getLiveStatus / delete
        │                         │
        ▼                         ▼
packages/database               integrations/facebook-ads
  FacebookMarketingMessage-       customer-file/ (pure: header map,
  Audience table + repository       normalizers, payload builder)
                                  apis/ create MM audience, session upload,
packages/imports                    list MM audiences, delete audience,
  CSV / XLSX parsers                notification_message_tokens
```

### 4.1 Data model — `FacebookMarketingMessageAudience`

| column | type | notes |
|---|---|---|
| `id`, `createdAt`, `updatedAt` | `sharedColumns` | |
| `workspaceId` | bigint FK → Workspace | `onDelete: cascade` |
| `customAudienceId` | text, NOT NULL, unique | Meta id; row inserted only after Meta creation succeeds |
| `adAccountId` | text, NOT NULL | `act_<id>` form, exactly as sent to Graph |
| `pageId` | text, NOT NULL | raw Page id, **no FK** (survives Page reconnect, as campaigns) |
| `name` | text, NOT NULL | |
| `description` | text, nullable | |
| `rowsUploaded` | integer, NOT NULL | sum of `num_received` across all uploads; every insert writes `0` explicitly |
| `readyAt` | timestamp, nullable | set once the token check succeeds |
| `facebookUserId` | text, nullable | app-scoped id of the grant used at create time |

Index on `workspaceId`. Add the relations file **and** register it in
`relations/index.ts` (both edits). Migration generated with `make:migration`,
SQL shown to the user, **not applied** without approval.

Count and `delivery_status` are not stored.

### 4.2 Integration layer — `integrations/facebook-ads`

**`src/customer-file/` (pure, no I/O except Web Crypto hashing)**

- `header-map.ts` — `mapHeaders(headers: string[]): { columns: Map<number, CustomerFileKey>; error?: "noIdentifier" }`.
  Normalize a header by lowercasing and removing spaces, `_`, `-`. Aliases:

  | Key | Accepted headers |
  |---|---|
  | EMAIL | `email`, `e-mail` |
  | PHONE | `phone`, `phone number`, `phonenumber` |
  | FN | `fn`, `first name`, `firstname` |
  | LN | `ln`, `last name`, `lastname` |
  | CT | `ct`, `city` |
  | ST | `st`, `state`, `province`, `state/province` |
  | ZIP | `zip`, `zip code`, `postal code`, `zip/postal code` |
  | COUNTRY | `country` |
  | DOB | `dob`, `date of birth` |
  | DOBY | `doby`, `year of birth` |
  | GEN | `gen`, `gender` |
  | MADID | `madid`, `mobile advertiser id` |

  Duplicate mapping for the same key → first column wins.

- `normalizers.ts` — one function per key, each `(raw: string, ctx) => string | null`:
  - EMAIL: trim, lowercase; null unless it matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
  - PHONE: `normalizePhoneNumber(raw, row.COUNTRY)` (existing helper); if null and the raw value
    does not start with `0`, digits only with leading zeros stripped; else null.
  - FN, LN: trim, lowercase, remove everything that is not a Unicode letter or space, collapse spaces, trim.
  - CT: as FN, then remove all whitespace.
  - ST: lowercase, remove non-letters.
  - ZIP: lowercase, remove whitespace; when country is `us`, keep the first 5 digits.
  - COUNTRY: trim, lowercase; null unless `^[a-z]{2}$`.
  - DOB → `{ doby, dobm, dobd }` per D22; DOBM/DOBD zero-padded.
  - DOBY: 4 digits between 1900 and the current year.
  - GEN: `m|male → m`, `f|female → f`, else null.
  - MADID: trim, lowercase (hyphens kept).

- `build-payload.ts` — `buildCustomerFilePayload(rows: string[][], columns): Promise<{ schema: string[]; data: string[][]; skipped: number }>`
  - `schema` = the keys present in the headers, in a fixed canonical order
    (`EMAIL, PHONE, FN, LN, CT, ST, ZIP, COUNTRY, DOBY, DOBM, DOBD, GEN, MADID`);
    a DOB column contributes DOBY/DOBM/DOBD.
  - Rows with neither valid EMAIL nor valid PHONE are counted in `skipped`, not emitted.
  - Every value except MADID is SHA-256 hashed (reuse the existing `sha256`); null → `""`.

**`src/apis/` (Graph calls, wrapped in `rescue`)**

- `createMarketingMessagesAudience({ accessToken, adAccountId, pageId, name, description, version })` → `{ id }`.
- `uploadAudienceUsersSession({ accessToken, customAudienceId, schema, data, version, onBatch? })` →
  `{ received, invalid }`. Splits into 10,000-row batches; one random 64-bit
  `session_id`, `batch_seq` 1..n, `last_batch_flag` on the final batch,
  `estimated_num_total = data.length`. On failure, throws an error carrying the
  `received`/`invalid` totals accumulated so far.
- `getMarketingMessagesAudiences({ accessToken, adAccountId, version })` → paginated list per §2.
- `deleteCustomAudience({ accessToken, customAudienceId, version })`; a "does not exist"
  Graph error is surfaced as a distinguishable `notFound` result.
- `getNotificationMessageTokenAudienceIds({ pageAccessToken, pageId, customAudienceId, version })` →
  `string[]` (`data[0].custom_audience_ids ?? []`).

### 4.3 Business layer — `facebookMarketingMessageAudienceService`

Inputs are plain data; the builder resolves the grant/session.

- **`create({ workspaceId, grant, adAccount, pageId, name, description, file })`**
  1. Parse the file with a new `readTabularFile` in `packages/imports` (CSV via `csv-parse`;
     `.txt` → CSV with the delimiter detected from the header line among `,` `;` `\t`; XLSX via the
     shared worksheet reader with D24 limits). Reject > 100,000 data rows.
  2. `mapHeaders`; `noIdentifier` → error, nothing created.
  3. `buildCustomerFilePayload`; zero rows → error, nothing created.
  4. `createMarketingMessagesAudience`; insert the row with `rowsUploaded: 0`.
  5. `uploadAudienceUsersSession`.
  6. `rowsUploaded += received` (also in the failure path, then re-throw a
     `ChatbotXException` carrying the partial count).
  7. Return `{ id, customAudienceId, received, skipped, invalid }`.
- **`uploadMore({ workspaceId, grant, id, file })`** — load the row scoped by `workspaceId`;
  steps 1–3, 5–7.
- **`list(workspaceId)`** — DB rows ordered by `createdAt desc`.
- **`getLiveStatus({ workspaceId, grant, resolvePageToken })`**
  - Group rows by `adAccountId`; fetch each account's list; keep only our ids.
  - For rows with `readyAt IS NULL`, grouped by `pageId`: resolve the Page token; if none,
    mark `pageDisconnected`. Otherwise call the tokens endpoint (concurrency 5); ready if
    the returned ids include the audience id. Persist `readyAt = now()` for newly-ready rows in
    one update.
  - Per-account / per-page failures are logged (`logger.error({ err }, …)`) and leave those
    entries `null`; the call never throws for a partial Graph failure.
  - Returns `Record<customAudienceId, { lower: number | null; upper: number | null; deliveryStatus: { code: number; description: string } | null; ready: boolean; missingOnMeta: boolean; pageDisconnected: boolean }>`.
- **`delete({ workspaceId, grant, id })`** — `deleteCustomAudience`; on success or `notFound`,
  delete the DB row; any other error aborts and keeps the row.

### 4.4 Builder

**Page / tabs** — `page.tsx` reads `searchParams.tab` (`campaigns` default, `audiences`).
The grant gate stays above the tabs (missing → grant panel only; expired → panel +
read-only tabs). Tabs use `@chatbotx.io/ui` `Tabs`, syncing to the URL via
`router.replace`. The Campaigns tab renders the existing `MarketingMessagesTable`.

**oRPC** (`api/private.ts`, `authorizedAPI` + `workspaceAuthorizedMidddleware`):

- `listMarketingMessagesAudiencesAPI` — DB rows.
- `listMarketingMessagesAudiencesLiveAPI` — `requireValidGrant` then `getLiveStatus`;
  the Page token resolver uses the workspace's Messenger integration service.

**Actions** (`workspaceActionClient`, bound via `.bind(null, workspaceId)`):

- `create-audience.action.ts` — `FormData` input; `requireValidGrant`; ad account must be in
  `getMarketingMessagesAdAccounts` with ToS accepted (else error with `tosUrl`); `pageId`
  must be one of the workspace's Messenger integrations; file ≤ 20 MB with an allowed
  extension and MIME type.
- `upload-more-audience.action.ts` — `{ id, file }`.
- `delete-audience.action.ts` — `bindArgsSchemas(workspaceIdrequestParams)` + `inputSchema({ id })`,
  mirroring the existing `delete.action.ts`.

**`AudiencesTable`** — mirrors `MarketingMessagesTable` (`DataTable`, `useDataTable`,
`pageCount: -1`). Columns: Custom Audience ID · Page · Ad account · Name · Description ·
Approx. count · Status · Created · actions. Page/ad-account names, count, and status are
resolved in `cell` (not accessors) because they arrive from async queries. Live query
disabled when the grant is expired.

Status (pure function `resolveAudienceStatus`, in order):

1. `readyAt` set or live `ready` → **Ready** badge.
2. `missingOnMeta` → **Deleted on Meta**.
3. `deliveryStatus.code !== 200` → `deliveryStatus.description` verbatim.
4. Otherwise empty.
5. Plus a "Page disconnected" hint when `pageDisconnected`.

Count: `Intl.NumberFormat` `lower – upper`; `–` when either bound is null/negative.

**`CreateAudienceDialog`** (`mode: "create" | "append"`), stepper header
1 Prepare list · 2 Upload · 3 Confirm:

- **Step 1** — description text with the "About hashing" link
  (<https://www.facebook.com/business/help/112061095610075>, new tab); "Download file template"
  → `/templates/marketing-messages-audience.csv`; chips "Include at least one main identifier"
  (Email, Phone Number) and "Include more identifiers" (Mobile advertiser ID, First name,
  Last name, City, State/Province, Country, ZIP/Postal code, Date of birth, Year of birth,
  Gender); Next.
- **Step 2** — note text; Ad account select (ToS-not-accepted options disabled with
  "Accept terms" link); Page select; Name (required, 1–100); Description (optional, ≤ 500);
  drag-and-drop file zone (`.csv,.txt,.xlsx`, max 20 MB, client + server checked);
  Back / Upload. Upload is pending while the action runs; the dialog cannot be dismissed
  mid-upload. Server errors render as an inline alert, including the partial-upload message.
  In `append` mode, account/Page/name are shown read-only and only the file is required.
- **Step 3** — success icon, "Upload successful", "Your Messenger subscriber list has been
  uploaded {count, plural, …} rows"; skipped/invalid lines when > 0; info alert about the
  matching delay; Done closes and invalidates.

Form: `react-hook-form` + zod via `useHookFormAction`.

**Invalidation** — new `useInvalidateMarketingMessagesAudiences` invalidates both audience
queries after create, upload more, and delete (invariant 21).

**Template** — `apps/builder/public/templates/marketing-messages-audience.csv`: headers
`email,phone,madid,fn,ln,zip,ct,st,country,dob,doby,gen` with the user's 9 sample rows.

**i18n** — all strings under `facebookMarketingMessages.audiences.*` in `en.json` and every
locale file; reuse `fields.name` / `fields.description` where they fit.

## 5. Error handling

| Situation | Behavior |
|---|---|
| Grant missing/expired | Actions/APIs throw `notGranted` (existing); UI per D14 |
| Ad account ToS not accepted | Action error with `tosUrl` |
| Page not connected to workspace | Action validation error |
| File too large / wrong type / > 100k rows | Error before any Graph call |
| No email/phone column, or zero valid rows | Error before any Graph call |
| Audience create fails | Error; nothing persisted |
| Upload batch fails | Row kept with partial `rowsUploaded`; error states the partial count and suggests "Upload more" |
| Live status partial failure | Affected cells show `–`; rest render |
| Delete: Meta says not found | DB row deleted anyway |
| Delete: other Graph error | Error; row kept |

PII: never logged (log counts and ids only), never persisted, file discarded.

## 6. Testing

- `integrations/facebook-ads/__tests__/customer-file.test.ts`
  - Normalizers: phone `1-(650)-561-5622` → `16505615622`; `+44 303 123 7300` →
    `443031237300`; `(+84) 091-2345678` → `84912345678`; `0912345678` (no country) → null.
    DOB pivot (`10/21/68` → 1968/10/21), explicit `doby` wins, ZIP US 5-digit rule,
    MADID unhashed, GEN mapping, names keep Unicode letters.
  - Hashes match known SHA-256 vectors.
  - Header map: aliases, unknown ignored, `noIdentifier`.
  - Full template file → exact schema and 9 rows.
  - Session upload: 25,000 rows → 3 batches, `batch_seq` 1..3, `last_batch_flag` only on 3,
    one `session_id`; mid-batch failure carries partial totals.
- `packages/business/__tests__/` — validation before creation (no Graph call on invalid
  file); partial failure persists the count; `uploadMore` accumulates; live status merge,
  `readyAt` persistence, per-page failure isolation, `missingOnMeta`; delete handles
  `notFound`.
- `apps/builder/__tests__/` — `resolveAudienceStatus` and count formatting; tab
  search-param parsing.
- Gate: `pnpm lint`, `check-types` for touched workspaces, tests, and the
  `invariant-guard` agent.
