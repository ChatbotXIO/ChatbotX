# Plan: Google Ads conversion statistics and read-only public API

Status: **implemented, not deployed** (S1-S4; see §11 for what was built and what is unverified). Builds on `2026-10-05-google-ads-conversions.md`,
`2026-10-07-google-ads-upload-method.md` and `2026-10-08-google-ads-conversion-options.md`
(read their "As-built" sections first; the last one removed `orderId`, added `options`
and the event identity). This plan adds **no migration**.
Decisions are in §2.

## 1. Goals and non-goals

**Goals**

1. A statistics view for the conversions ChatbotX sends to Google Ads: how many were
   confirmed by Google, are waiting for Google, are queued, failed or skipped, per day,
   per conversion action and per channel, plus the confirmed value per currency.
2. The view lives in the Dashboard (Ads area), next to the Meta ads analytics, and the
   Google Ads settings page links to it.
3. A read-only public API (and therefore CLI and MCP) with three operations: statistics,
   events and connection (the synced conversion actions, so a flow author can find the
   `conversionActionId` a step needs).
4. Private UI and public API call the same service methods (AGENTS.md invariant 9).
5. Numbers are defined once, in one pure mapping, and every surface uses it.

**Non-goals (deferred)**: any public write operation (recording a conversion, retrying,
connecting, changing consent); top Google failure reasons; spend, ROAS or cost (Google Ads
reporting API); exports; alerts; per-contact drill-down; caching of the aggregates; a new
database index (§3.4); a Google tab inside the Meta funnel view; a second date basis
("recorded at", for a needs-attention view of back-dated failures, §10).

## 2. Decisions (binding)

| # | Decision |
|---|---|
| D1 | **Status counts are the raw event statuses** (`pending`, `sending`, `sent`, `processed`, `failed`, `skipped_no_account`, `skipped_expired`), zero-filled, in every response. Derived buckets for the UI come from one pure helper (§4.2). The API never returns pre-derived buckets, so its contract stays stable if a bucket label changes. |
| D2 | **Events are bucketed by `occurredAt`** (the conversion time). Reason: it is the field the history filter, the `listByWorkspace` query and the `(workspaceId, occurredAt)` index already use, so the dashboard, the history and the API agree. Google Ads' standard "Conversions" columns are reported by the ad-interaction (click) date; the separate "by conv. time" columns use the conversion date, so compare with those. A back-dated conversion (the step's Conversion time) appears on its conversion day, not on the day it was recorded; the help line and the API description say so. |
| D3 | **`confirmed` means `processed`.** On Data Manager an event is `sent` until Google's asynchronous processing finishes; on the legacy method it ends `processed` immediately; a recovered duplicate also ends `processed`. `sent` is shown as "Awaiting Google", never as success. |
| D4 | **Delivery rate = `processed / (processed + failed)`**, `null` when the denominator is 0. Queued, awaiting and skipped events are excluded because their outcome is not final. Skipped events are reported separately, not as failures. |
| D5 | **Confirmed value**: `sum(value)` of `processed` events grouped by `currency` (decimal strings, never summed across currencies). Events with no value are counted but add nothing. |
| D6 | **Failures are broken down by `failureStage` only** (`delivery`, `processing`, `timeout`, plus `unknown` for a failed row with no stage). The row has no stable per-event cause code (free sanitized text in `error`), so a "top reasons" table is deferred. |
| D7 | **One place for the full view: Dashboard → Ads → Google Ads** (route `dashboard/ads/google`, super admin only, like the other ads dashboards). The settings page keeps its history and gains one link to the dashboard; no duplicate stats widgets. |
| D8 | **Public scope is the existing `ads` scope.** No scope enum change, no migration, no token-picker change. Read-only tokens (`permission: read_only`) work because every operation is a GET. |
| D9 | **Public surface is read-only: 3 GET operations.** Writes stay UI-only: recording a conversion through an API would bypass the click, timing and identity rules. The parity manifest keeps the nine Google action entries `private:` with an updated reason. |
| D10 | **MCP visibility: hidden** (no `mcpSpec`), reachable through `search_tools` / `call_tool`, like the Meta ads analytics. The default MCP tool set, its README count and snapshot do not change. |
| D11 | **No cache in the first version.** The settings and retry flows need fresh numbers, ranges are clamped to 366 days, three queries per call, and the existing per-workspace token rate limit applies to the API. Revisit with measured volume (§3.4, §10). |
| D12 | **The public events resource is the private projection** (`toGoogleAdsEventResource`), strengthened (§4.4): masked click id; the stored `error` text is sanitized and the row's own click id, `transactionId` and `requestId` are replaced by `[redacted]` in it; no `transactionId`, `requestId`, claim data, attempt counters, `contactInboxId` or `workspaceId`. It does carry `identity.id` (the resolved order or event ID the admin chose to send, which can hold contact data) and Google's sanitized error text; this is documented in `docs/developer/workspace-api-tokens.md` like the other PII call-outs (minting a token already requires a super admin). |
| D13 | **The dashboard is server-rendered.** The page reads search params, calls the service on the server and renders a client view; a filter change is a navigation (`router.push`), with a `loading.tsx` skeleton. `loading.tsx` covers the first entry only; filter changes use a `useTransition`-wrapped navigation, and while it is pending the content is dimmed and marked `aria-busy`. No client-side fetch and no new private oRPC procedure. |

## 3. Data and queries

### 3.1 Window, timezone, filters

Input (service level): `{ workspaceId, from, to, tz, channel?, conversionActionId? }`.

- `from` / `to` are `YYYY-MM-DD` keys in `tz`. The window is the **inclusive** instant range
  `[since, until]` returned by `parseAnalyticsDateRange`
  (`packages/business/src/ads-analytics/date-range.ts`: `since` = local `from 00:00:00`,
  `until` = local `to 23:59:59.999`, converted with the zone), applied with `gte` / `lte`
  exactly as `listByWorkspace` does. The helper normalises the inputs (invalid or inverted
  keys fall back, the range is clamped to 366 days keeping the most recent year, an unknown
  `tz`, an offset zone such as `+07:00`, or a name over 64 characters falls back to UTC, because PostgreSQL does not accept offset zones; `resolveTimezone` also corrects the case of a known IANA name (Intl is case-insensitive, PostgreSQL matches the exact text) and keeps the caller's spelling of a known alias pair from `timezoneCandidates` (`Asia/Saigon` for `Asia/Ho_Chi_Minh`), so the TypeScript window and the SQL `resolvedTimezone` day buckets always use the SAME zone) and returns the resolved `from`, `to` and `timezone`, which the response echoes
  as `range.from`, `range.to`, `range.tz`. Tests pin its behaviour at the boundaries, across a DST change, and with
  independently invalid endpoints.
- `enumerateDateKeys` (zero-fill) lives in `ads-analytics/date-range.ts` and is exported
  (the Meta service uses it from there), and the Google code imports from
  `../ads-analytics/date-range` directly, never from the `ads-analytics` index (which
  pulls in the Meta service graph). `zonedDateKey`
  (`packages/database/src/queries/date-bucket.ts`) is used for the per-day SQL.
- `channel` is a plain string filter validated against `GOOGLE_ADS_CHANNEL_VALUES` on input
  (`whatsapp`, `messenger`); `conversionActionId` is a numeric string (the step pattern).
  Both optional.
- The per-day `GROUP BY` uses the ordinal (`sql\`1\``) for the date expression, as the Meta
  repository does (`ads-conversion-event/repository.ts`), because a bound timezone parameter
  renders as different placeholders in `SELECT` and `GROUP BY`. The date expression must
  therefore be the **first key** of the drizzle `select({...})` object (key order sets the
  column order) and the group-by is `groupBy(sql\`1\`, channel)`; a real-PG test pins it.
- **Default range and timezone.** `getDefaultAdsAnalyticsRange` takes a `tz` parameter and
  builds "today" with `formatInTimeZone(now, tz, "yyyy-MM-dd")`; `parseAnalyticsDateRange`
  passes the resolved zone, and `""` means UTC: callers without a `tz` (and the existing
  tests) are unchanged, while callers that pass a `tz` (the Meta `[channel]` page, the
  `ads/export` route, the Meta public API) get a fallback range in that zone, which is
  intended. Tests: the fallback range for UTC+7 just after
  local midnight, and a Meta-style call with a `tz` and an invalid `from` falls back to the
  local "today" in that zone.

### 3.2 Repository (`packages/database`, raw queries only)

`googleAdsConversionEventRepository` gains read methods that share one
`windowFilters(...)` where-builder (workspace, `occurredAt` range, optional channel and
action; **always** `workspaceId`). Status counts use `count(*) FILTER (WHERE status = …)`
columns, one per status, so a row carries all seven counts.

| Method | Query | Used for |
|---|---|---|
| `statsByDayAndChannel(filters, tz)` | `GROUP BY zonedDateKey(occurredAt), channel`; seven status counts plus four failure columns: three `count(*) FILTER (WHERE status='failed' AND "failureStage" = …)` plus `count(*) FILTER (WHERE status='failed' AND "failureStage" IS NULL)` for `unknown` (never derived by subtraction) | `totals`, `timeseries`, `byChannel`, `failuresByStage` (all derived from these rows, so they always agree) |
| `statsByAction(filters, limit)` | `GROUP BY conversionActionId`; seven status counts, `(array_agg(conversionActionName ORDER BY occurredAt DESC))[1]` and the same for `conversionActionCategory` (the latest snapshot, so a rename shows the new name); `ORDER BY count(*) DESC, conversionActionId LIMIT limit + 1` | `byAction`, `byActionTruncated` |
| `confirmedValueByCurrency(filters)` | `WHERE status = 'processed' AND value IS NOT NULL GROUP BY currency`; `sum(value)::text`, `count(*)` | `confirmedValue` |
| `existsForWorkspace(workspaceId)` | `SELECT 1 … WHERE workspaceId = $1 LIMIT 1` | navigation entry (§5.1) |

`failuresByStage` sums the per-stage columns; `failureStage` is nullable in the schema, so
the response carries a fourth count, `unknown`, for `failed` rows without a stage, and
`delivery + processing + timeout + unknown == totals.failed` is a pinned invariant (real-PG
test). All values are bound parameters; no string-built SQL. `listByWorkspace` also gains an
optional `conversionActionId` filter (additive; the private events request schema and the
public events operation expose it so events can be matched to `byAction` rows).

### 3.3 Service (`google-ads/service.ts` entry points, `google-ads/stats.ts` aggregation)

`googleAdsConversionService.getStats(input)` (in `service.ts`, delegating to `getGoogleAdsStats` in `stats.ts`) validates with a zod schema
(`getGoogleAdsStatsInput`) whose `from`, `to` and `tz` are **plain strings (empty or
invalid allowed)**: normalisation is `parseAnalyticsDateRange`'s job, so a first visit with
no query string works; only the public route applies the `YYYY-MM-DD` regex, and
`channel` / `conversionActionId` are validated in the service. It resolves the range, runs the day x channel query, the action query and the value
query in one `Promise.all`, and builds the contract of §4.1: `totals`, `byChannel`,
`timeseries` and `failuresByStage` are sums over the **same** `statsByDayAndChannel` rows;
`byAction` is a separate query and is best effort against concurrent status changes
(documented). A confirmed-value row without a currency is not listed; a day x channel row
outside the enumerated days is dropped from every block, so the blocks cannot disagree. It contains no SQL and no UI wording. `hasAnyEvent(workspaceId)` wraps
`existsForWorkspace`. The existing `listEvents` is reused by the public events operation.

### 3.4 Performance and indexes

Existing indexes: `(workspaceId, occurredAt)`, `(workspaceId, status)`. The stats queries
filter by workspace and `occurredAt` range, so the range index serves them; three queries
scan the same bounded window. No retention exists on this table, so rows grow without
bound; the 366-day clamp and the range index bound the work. **No new index in this plan**:
the table has not been measured in production. An `EXPLAIN (ANALYZE)` check on a
synthetic data set (one workspace with 1M rows over a year) is still to run (§11); the
follow-up trigger is a p95 above 500 ms, and the candidate is
`(workspaceId, occurredAt, status)`, added in a separate migration at that time.

## 4. Contracts

### 4.1 Stats response (private view and public API share the schema)

```ts
const countsSchema = z.object({            // all seven keys always present
  pending: z.number().int(), sending: z.number().int(), sent: z.number().int(),
  processed: z.number().int(), failed: z.number().int(),
  skipped_no_account: z.number().int(), skipped_expired: z.number().int(),
})
export const googleAdsStatsResponse = z.object({
  range: z.object({ from: z.string(), to: z.string(), tz: z.string() }), // as resolved
  totals: countsSchema.extend({
    total: z.number().int(),
    deliveryRate: z.number().min(0).max(1).nullable(),               // D4
  }),
  failuresByStage: z.object({ delivery: z.number().int(), processing: z.number().int(), timeout: z.number().int(), unknown: z.number().int() }),
  confirmedValue: z.array(z.object({ currency: z.string(), value: z.string(), count: z.number().int() })), // D5
  timeseries: z.array(z.object({ date: z.string(), counts: countsSchema })),                // zero-filled
  byAction: z.array(z.object({ conversionActionId: z.string(), name: z.string().nullable(), category: z.string().nullable(), total: z.number().int(), counts: countsSchema })),
  byActionTruncated: z.boolean(),                                    // more than 50 actions
  byChannel: z.array(z.object({ channel: z.string(), total: z.number().int(), counts: countsSchema })), // plain string, like the events resource
})
```

The schema lives in `packages/business/src/google-ads/stats-schema.ts` (pure zod, next to the
service, which cannot import the builder); the dashboard and the public operation both use it.
No `workspaceId`, no row ids, no click ids. Every field has a `.describe()` (they become the
OpenAPI text, the CLI help and the MCP tool description). `channel` is a plain string
because the column is plain `ChannelType` text limited only at the producer; an enum would
turn a future channel change into a 500 on old rows.

### 4.2 Buckets for the UI (pure helper, `packages/business/src/google-ads/stat-buckets.ts`)

```ts
export const GOOGLE_ADS_STAT_BUCKETS = {
  confirmed:      ["processed"],
  awaitingGoogle: ["sent"],
  queued:         ["pending", "sending"],
  failed:         ["failed"],
  skipped:        ["skipped_no_account", "skipped_expired"],
} as const
export const toStatBuckets = (counts: GoogleAdsStatusCounts) => ({ … sums per bucket … })
```

The file imports only database partials types. The subpath export
`"./google-ads/stat-buckets"` is declared in `packages/business/package.json` (the pattern of
`./google-ads/click-fields`); the builder imports it only through that subpath, never from
the package root (which pulls in server and database code). The API does not use it (D1).
A type-level exhaustiveness check over the inverted map makes a new event status a compile
error.

### 4.3 Public operations (`apps/builder/src/features/integration-google-ads/api/public.ts`)

Registered in `apps/builder/src/routers/public.ts` as `googleAds: googleAdsPublicRouter`
(eager, nested under the resource, one `public.ts` per feature, as
`docs/developer/workspace-api-tokens.md` requires). All use
`workspaceTokenAuthAPIForScope("ads")` and `.errors(possibleErrorsOnListingResource)` (none
has a path parameter or a not-found case: `getConnection` answers `connected: false`), tag
`Google Ads`, a useful non-redundant `description`.

| operationId | Route | Input | Output | Service call |
|---|---|---|---|---|
| `googleAds.getStats` | `GET /v1/google-ads/stats` | `from`, `to` (`YYYY-MM-DD`), `tz?`, `channel?`, `conversionActionId?`, mirroring `adsAnalyticsPublicRequest`; normalisation happens in the service and the resolved `range` is echoed (no 422 for an inverted or oversized range) | `googleAdsStatsResponse` | `googleAdsConversionService.getStats` |
| `googleAds.listEvents` | `GET /v1/google-ads/events` | `publicListRequest` (page, perPage ≤ 50, the `maxLimit` of that helper) + `status?`, `channel?`, `conversionActionId?`, `since?`, `until?` (ISO instants, inclusive, the private schema's names) | `{ data, pageCount }` with `pageCount = max(1, ceil(total / perPage))` | `googleAdsConversionService.listEvents` |
| `googleAds.getConnection` | `GET /v1/google-ads/connection` | none | the existing `googleAdsIntegrationResource` (`schema/integration.ts`, exported, `.describe()` added to each field, no new fields): every field of that resource: `connected`, `readiness`, `customerId`, `descriptiveName`, `currencyCode`, `uploadMethod`, `consent` (`toConsentView`), `setupError` (an enum code), `conversionActions[]` (`id`, `name`, `category`, `status`, `countingType`, `attributionModel`) and `conversionActionsSyncedAt` | `integrationGoogleAdsService.getPublicSetup` + `googleAdsSettingsService.getConsent` |

- `googleAdsEventResource` (`schema/events.ts`) is exported for the public wrapper and
  gains `conversionActionId`; the private history UI ignores the extra field.
- The connection response is the credential-free `getIntegration` projection: `auth`,
  developer token, tokens and `workspaceId` never appear (the existing public-setup test
  already pins the strip). A workspace with no connection returns `connected: false`, an
  empty action list and the consent view (consent outlives a connection).
- CLI names derived from the paths: `google-ads:stats`, `google-ads:events`,
  `google-ads:connection` (no collision with `ads:*`).
- No request accepts a `workspaceId` and no response carries one (pinned by
  `public-spec-operations.test.ts`).

### 4.4 Events projection hardening (shared by the history UI and the API)

`toGoogleAdsEventResource` replaces, in the stored `error` text, the row's own click id
(today), **`transactionId` and `requestId`** (new) with `[redacted]`. Tests embed each of
the three values inside `error` and assert none survives, in addition to asserting that
the property names are absent.

## 5. UI (Dashboard → Ads → Google Ads)

### 5.1 Route, data flow and navigation

- New static route `apps/builder/src/app/space/[workspaceId]/dashboard/ads/google/page.tsx`
  with a sibling `loading.tsx` (a static segment wins over the dynamic `[channel]`, which
  validates against `adsEligibleChannelTypes`; the existing `ads/conversion-events` page
  already relies on this). Guard: `resolveGuardedWorkspaceId(params, "superAdmin")`.
- Search params use a nuqs cache like `adsAnalyticsSearchParamsCache` **but with
  `parseAsString.withDefault("")` for `from`, `to` and `tz`**, so the fallback range is
  chosen per request by `parseAnalyticsDateRange` (the Meta cache computes its default once
  at module load, which goes stale on a long-running server). The
  resolved `range` from the response is echoed into the date control. Other params:
  `channel` (`parseAsStringLiteral(GOOGLE_ADS_CHANNEL_VALUES)`; empty means all) and
  `action` (a parser that accepts only `^\d+$` and otherwise falls back to the empty "all"
  value), so an invalid value resets the filter instead of reaching the service and
  rendering the error view.
- The action select lists the synced conversion actions merged with the actions present in the
  stats (so a removed action that still has history stays selectable).
- The page runs `Promise.all([getStats, getSetup, workspace createdAt, resolveAdsDashboardChannels])` (the last one feeds the nav; the creation date comes from
  `workspaceService.findById({ id: workspaceId })`, the same call `getAdsSwitcherData` uses,
  not from `getAdsSwitcherData` itself and never from `db`) on the server and
  renders the client view `GoogleAdsStatsView` with `connected` and `workspaceCreatedAt`
  (the Lifetime preset needs it; the empty and not-connected states need the connection).
  The date control's preset label ("Last 7 days", ...) is classified with "today" read in
  the resolved `range.tz` (`lib/stats-preset.ts`), never in the runtime's local zone, so the
  server render and the browser hydration produce the same first paint. The server captures
  one reference instant per request and passes it down (`referenceNow`), so a midnight
  crossed between the render and the hydration cannot change the label.
  `resolveGoogleAdsDashboardEntry` is used by the contacts, conversations and Meta `[channel]` pages; the Google page itself does not call it: it always passes `showGoogleAds`
  (it is the entry, connected or not). Filter changes go through a `useTransition`-wrapped push (a local wrapper
  around `useAdsRangeUrl` and the channel / action selects; `DateRangePresetFilter` is
  reused): while pending, the content is dimmed and `aria-busy` (D13). The nav link carries
  no `tz`, so when the URL has none and the browser zone differs, the view calls
  `router.replace` once to add the browser `tz`.
- **Navigation.** `AnalyticsNav` receives a new `showGoogleAds: boolean` prop (default
  false). A server resolver `resolveGoogleAdsDashboardEntry({ workspaceId, isSuperAdmin })`
  (next to `resolveAdsDashboardChannels`, `features/analytics/lib`) returns `false` for
  non-super-admins and otherwise `integrationGoogleAdsService.getSetup(...) != null ||
  googleAdsConversionService.hasAnyEvent(workspaceId)` (history survives a disconnect, and
  the check is not limited to the selected date range). The contacts, conversations
  and Meta `[channel]` pages pass the result; the new page passes the constant `true`. The entry is "Google Ads" (`ads.dashboardNav.google`, segment `ads/google`).
- The settings page (`google-ads-settings.tsx`) adds one text link "View statistics" in the
  history section header to `/dashboard/ads/google`. Nothing else on that page changes.

### 5.2 Layout (desktop; the same blocks stack at 375 px)

```
Google Ads                          [Last 7 days ▾] [All channels ▾] [All actions ▾]
Conversions sent to Google, by the time each conversion happened.

┌ Confirmed ─┐ ┌ Awaiting Google ┐ ┌ Queued ┐ ┌ Failed ┐ ┌ Skipped ┐ ┌ Delivery rate ┐
│    128     │ │       6         │ │   2    │ │   4    │ │   9     │ │     97%       │
└────────────┘ └─────────────────┘ └────────┘ └────────┘ └─────────┘ └───────────────┘
Confirmed value:  1,240.50 USD (96 conversions) · 3,100,000 VND (32)

Conversions per day (stacked: confirmed / awaiting / queued / failed / skipped)
▁▃▅▇▅▃▆   (accessible table alternative below the chart)

By conversion action                 Confirmed Awaiting Queued Failed Skipped
Purchase (PURCHASE)                       96        3       1       2       4
Submit lead form (SUBMIT_LEAD_FORM)       32        3       1       2       5

By channel        WhatsApp 110 confirmed · Messenger 18 confirmed
Failures by stage Delivery 3 · Processing 1 · Timeout 0  (Unknown shown only when > 0)
```

- Tiles use the tone map of the history badges (`eventStatusTone`); the chart reuses the
  project's chart primitives (`AdsPerformanceChart` patterns); series use semantic colours
  (green confirmed, blue awaiting, grey queued and skipped, red failed), never the only signal,
  and a text alternative
  (visually hidden `<table>` or a "View as table" toggle).
- States: loading skeleton (`loading.tsx`, first entry), **error** via a new
  `dashboard/ads/google/error.tsx` (client component using `googleAds.stats.error.*`; retry
  runs `startTransition(() => retry())` with the stable `retry` prop of Next 16.3 error
  files (it re-fetches and re-renders the segment; `reset()` alone would not); there is no
  client logging facility, and Next already logs the server failure, so nothing is logged
  with `console`; since `AnalyticsNav` lives in the page, the error view renders its own link
  back to the Analytics dashboard, labelled with the existing `fields.analytics.label`), **empty** ("No conversions in this period" plus the setup hint when
  nothing is connected), **not connected but has history** (history is shown with a muted
  "Google Ads is not connected" line). Dates are formatted in the resolved `tz`.
- Numbers use the locale formatter; currency values `Intl.NumberFormat` with the currency
  code; more than 5 currencies collapse to "+N more" with a tooltip.
- The help line states the basis (D2): "Counted on the day each conversion happened, which
  can differ from the day it was recorded."

### 5.3 Permissions

Super admin only (same as the other ads dashboards and the settings page). Support
sessions can read (synthetic super admin). The view never receives click ids or `error`
text (stats only).

### 5.4 i18n keys (en; all 21 locales; en + vi hand-written, the rest translated; ICU rule:
literal `{{x}}` quoted, parameters unquoted; `pnpm --filter builder i18n:check`)

```
ads.dashboardNav.google                    "Google Ads"
googleAds.stats.title                      "Google Ads"
googleAds.stats.description                "Conversions sent to Google, by the time each conversion happened."
googleAds.stats.basisHelp                  "Counted on the day each conversion happened, which can differ from the day it was recorded."
googleAds.stats.filters.allChannels        "All channels"
googleAds.stats.filters.allActions         "All actions"
googleAds.stats.tiles.confirmed            "Confirmed"
googleAds.stats.tiles.awaitingGoogle       "Awaiting Google"
googleAds.stats.tiles.queued               "Queued"
googleAds.stats.tiles.failed               "Failed"
googleAds.stats.tiles.skipped              "Skipped"
googleAds.stats.tiles.deliveryRate         "Delivery rate"
googleAds.stats.tiles.confirmedHelp        "Google confirmed it recorded these conversions."
googleAds.stats.tiles.awaitingGoogleHelp   "Sent to Google, waiting for Google to finish processing."
googleAds.stats.tiles.queuedHelp           "Waiting to be sent."
googleAds.stats.tiles.failedHelp           "Not accepted or not processed by Google."
googleAds.stats.tiles.skippedHelp          "Not sent: no ready account, or too old for Google."
googleAds.stats.tiles.deliveryRateHelp     "Confirmed ÷ (confirmed + failed). Queued, awaiting and skipped are not counted."
googleAds.stats.confirmedValue             "Confirmed value"
googleAds.stats.confirmedValueItem         "{value} ({count, plural, one {# conversion} other {# conversions}})"
googleAds.stats.moreCurrencies             "+{count} more"
googleAds.stats.chart.title                "Conversions per day"
googleAds.stats.chart.viewAsTable          "View as table"
googleAds.stats.byAction.title             "By conversion action"
googleAds.stats.byAction.truncated         "Showing the 50 actions with the most conversions."
googleAds.stats.byChannel.title            "By channel"
googleAds.stats.byChannel.confirmedCount   "{count, plural, one {# confirmed} other {# confirmed}}"
googleAds.stats.failures.title             "Failures by stage"
googleAds.stats.failures.unknown           "Unknown"
googleAds.stats.empty.title                "No conversions in this period"
googleAds.stats.empty.description          "Conversions appear here once a flow step or trigger sends one."
googleAds.stats.notConnected               "Google Ads is not connected."
googleAds.stats.error.title                "Couldn't load statistics"
googleAds.stats.error.retry                "Try again"
googleAds.stats.viewStatistics             "View statistics"
googleAds.stats.chart.tableCaption         "Conversions per day"
googleAds.stats.chart.dateColumn           "Date"
googleAds.stats.filters.channelLabel       "Channel"
googleAds.stats.filters.actionLabel        "Conversion action"
googleAds.stats.deliveryRateNone           "—"
googleAds.stats.deliveryRateNoneHelp       "No confirmed or failed conversions in this period."
googleAds.stats.actionFallback             "Action {id}"
googleAds.stats.openSettings               "Open Google Ads settings"
```

(Channel names, conversion action names, status words and the failure stage names
(`googleAds.events.stage.*`) reuse existing keys; `confirmedValueItem`'s `{value}` is
already currency-formatted with `Intl.NumberFormat`.)

## 6. Errors, edge cases, failure handling

- Invalid / inverted / oversized range: normalised by `parseAnalyticsDateRange`; the
  response echoes the resolved `range` so clients can see it (UI and API alike).
- Unknown `tz`: falls back to UTC, echoed in `range.tz`.
- Unknown `channel` / non-numeric `conversionActionId`: input validation error (422) on the
  public API, ignored (reset to "all") by the UI search-param parser.
- No events: every count is 0, `deliveryRate` is `null`, arrays are empty and the
  timeseries has one zero row per day.
- Deleted or renamed conversion action: the grouped name and category are the snapshot
  stored on the events, so history of removed actions still renders.
- A removed integration: stats still work (events outlive the connection).
- Back-dated events outside the window do not appear (D2); the history list on the
  settings page shows every event.
- Query failure: the page renders the error state; the public API returns the standard
  500 envelope; nothing partial is returned (one `Promise.all`).
- Big workspaces: bounded by the 366-day clamp and the 50-row action limit
  (`byActionTruncated`); the per-workspace API rate limit protects the endpoint.

## 7. Tests

**Business (`packages/business/__tests__`)**: `getStats` with a mocked repository:
zero-fill of days and statuses, range normalisation (default, inverted, clamp), tz fallback,
`totals == Σ timeseries == Σ byChannel` (one source), `deliveryRate` table (0/0 → null,
only skipped → null, 3 processed + 1 failed → 0.75), confirmed value per currency (no
cross-currency sum, null value ignored), channel and action filters passed through, action
truncation (fewer than 50 actions with many statuses → not truncated and no status lost;
51 actions → truncated with a deterministic tie-break), `workspaceId` always in the filter,
`getStats` with `from: ""`, `to: ""`, `tz: ""` returns the default range; `toStatBuckets` table and the
exhaustiveness check; `enumerateDateKeys` after the move (existing Meta tests still pass).

**Database**: repository unit tests (the where-builder always carries `workspaceId`;
ordinal group-by) and opt-in real-PG tests (`__tests__/integration/`): a back-dated event
outside the window is excluded; a renamed conversion action shows its latest name;
`delivery + processing + timeout + unknown == failed`; the date column is the first
select key; a seeded set across
statuses, days, channels, actions and timezones around midnight (`Asia/Ho_Chi_Minh` vs UTC,
and a DST zone), workspace A's rows never counted for B, `sum(value)` exactness for
decimals, `existsForWorkspace`.

**Builder**: public API tests modelled on `ads-public-api.test.ts` /
`ads-public-scope.test.ts` (scope `ads` required, other scopes 403, `null` scopes pass,
read-only token OK, no `workspaceId` accepted or returned, response parses the output
schema, events: click id masked and `transactionId` / `requestId` / own click id embedded
in `error` are redacted, `perPage=50` accepted and `perPage=51` rejected with 422 (the shared `publicListRequest` rejects instead of clamping), and the `pageCount` mapping, the `since` / `until` /
`conversionActionId` filters); `public-spec-operations` snapshot (+3 operations) and its
rules (descriptions, operationId shape, error declarations); `public-spec-mcp` snapshot
unchanged, with an assertion that the three tools are not in the default list; stats view
tests (tiles from counts, bucket sums, empty / error / not-connected-with-history, value
per currency, "+N more", accessible table alternative); the `[channel]` page calls
`notFound()` for `google` and the new page renders (file-system route precedence is checked
in the browser pass, vitest does not run Next routing); search-param parser (empty
defaults, no module-load date; `channel=foo` and `action=abc` resolve to "all" and the page
renders stats, not the error view); nav resolver table (non-super-admin false; connected;
history only, outside the selected range; neither) and all four pages pass `showGoogleAds`;
settings link; the pending state renders while a transition is in flight; the error
view's retry calls the `retry` prop; the browser `tz` is re-added after a tz-less navigation; the view adds the browser `tz` when missing; the default range for
UTC+7 just after local midnight; `resolveRangePreset` unit tests (every preset, month and
year rollover, the Lifetime floor, a zone different from the runtime's); a hydration test renders the real date control on the server
and in the browser with different clocks and asserts the same markup label, no hydration error
a single mount per range change, and a hydration that crosses midnight in `range.tz`. CLI: `apps/cli/__tests__/openapi-loader-command-names.test.ts` expects the
three new names.

**Browser (lead, Chrome, after implementation)**: super admin visits the route at
1440 / 375, light and dark; filter changes update the URL and data; empty state in a
workspace without events; seeded events produce the expected tiles; static route wins over
`[channel]`; keyboard order; chart text alternative; the settings link and the nav entry;
a `read_only` token calling the three endpoints through the real server (curl) and the CLI
(`--refresh-spec google-ads --help`).

## 8. Work breakdown (tests first; nothing committed)

Commands as in the previous plan: biome on changed files, `NODE_OPTIONS=--max-old-space-size=12288
pnpm --filter <ws> check-types`, `pnpm --filter <ws> test`, `pnpm --filter builder i18n:check`,
`pnpm check:circular` and `pnpm check:unused` (report only new findings), `pnpm lint` at the
end. Workspaces: `@chatbotx.io/database`, `@chatbotx.io/business`, `builder`, `chatbotx` (cli).

**S1 — Stats service.** Move and export `enumerateDateKeys` (update the Meta caller); the
repository methods and `windowFilters`; the optional `conversionActionId` filter in
`listByWorkspace`; `getStats`, its input schema and `hasAnyEvent`; `stat-buckets.ts` and
its package subpath export; the `EXPLAIN` note; the tests of §7 (business, database). TC:
database, business, builder (the moved helper).

**S2 — Dashboard.** the page, `loading.tsx`, `error.tsx`,
search-param cache, `GoogleAdsStatsView`, `showGoogleAds` prop and the resolver, the
pages' nav wiring, the settings link, the events projection hardening of §4.4 (shared
with S3), the §5.4 i18n keys in 21 locales, tests, browser pass. TC: business, builder.

**S3 — Public API.** `api/public.ts`, export `googleAdsEventResource` (+
`conversionActionId`), registration, scope middleware, spec snapshot update (`-u` after
review), CLI README (`### google-ads` section), parity manifest reason text for the nine
Google actions, `docs/developer/workspace-api-tokens.md` (the `ads` scope also covers
Google Ads reads; PII call-out for `identity.id` and sanitized error text), tests, the
`cli-mcp-docs` drift commands (`public-spec-operations`, `public-spec-mcp`, CLI loader
tests). TC: builder, chatbotx.

**S4 — Docs and review.** `docs/google-ads-conversion-tracking.md` (definitions D1-D6, the
public API), `docs/google-ads-conversion-options-admin-guide.md` (how to read the
dashboard), this plan's As-built, invariant-guard, `pnpm lint`, full review.

## 9. Rollout

No migration, no worker change. Deploy builder (with the business and database packages);
the new route and endpoints are additive. Owner action: none beyond the pending migrations
of the previous plan.

## 10. Risks and open questions

- **Count semantics are a product choice** (D2, D3, D4): counting by conversion time means
  a back-dated conversion, including a failed one, is invisible in a window that does not
  contain its conversion day, while the settings history shows it. A later "recorded at"
  basis (`createdAt`) for a needs-attention view is the remedy; it is deferred, not
  forgotten.
- **Table growth without retention**: aggregates scan a growing table. Mitigations are the
  366-day clamp and the range index; measure before adding the covering index (§3.4).
  A retention policy is a separate decision.
- **Public exposure**: the events operation returns `identity.id` and Google's sanitized
  error text (D12). Click ids, transaction ids and request ids are redacted and tested.
- **`ads` scope breadth**: a token with the `ads` scope can now also read Google Ads
  statistics and events; accepted because it is workspace-level analytics of the same
  advertising area.
- **`byAction` is a separate query** from the day/channel rows, so it can differ from
  `totals` by events that changed status between the two reads; documented, not guarded.
- **MCP hidden tools** are less discoverable; the CLI and `search_tools` cover them. Making
  `getConnection` default-visible (so flow authors see conversion actions) is a possible
  follow-up that changes the MCP README count and snapshot.
- Open questions: none blocking.

## 11. As-built

Overall: no migration. Nothing was verified in a browser or against a running server (the
builder is not reachable from the build environment and the previous plans' migrations are
unapplied); the opt-in real-PostgreSQL tests were not run here. MCP stays hidden
(no `mcpSpec`), so the default tool list is unchanged.

### S1 (stats service)

- `packages/business/src/google-ads/stats.ts` (`getGoogleAdsStats`, exposed as
  `googleAdsConversionService.getStats`, plus `hasAnyEvent`), `stats-schema.ts` (input and
  response schemas) and `stat-buckets.ts` (subpath export `./google-ads/stat-buckets`,
  client-safe: types and pure functions only). The repository
  (`google-ads-conversion-event/repository.ts`) gained `statsByDayAndChannel`,
  `statsByAction`, `confirmedValueByCurrency`, `existsForWorkspace` and the optional
  `conversionActionId` filter of `listByWorkspace`, all through one `windowFilters`.
- `ads-analytics/date-range.ts`: `enumerateDateKeys` moved and exported; the default range
  takes a `tz`; `resolveTimezone` maps offset zones (`+07:00`), unknown names and names over 64 characters to UTC, corrects the case of a known IANA name and keeps the caller's spelling of a known alias pair from `timezoneCandidates`, so the TypeScript window and the SQL `resolvedTimezone` buckets use the same zone. Real-PG tests in
  `packages/database/__tests__/integration/google-ads-conversion-event-stats.test.ts`.
- Aggregation rule: a day x channel row outside the enumerated days is dropped from totals,
  series, channels and failures alike; a confirmed-value row without a currency is not
  listed.
- `EXPLAIN (ANALYZE)` on the synthetic data set: **not run** (it needs ~1M inserted rows,
  and S1 must not write to a shared or local database). Run it on a disposable database
  with the migrations applied, one workspace and 1M events over a year, then:

  ```sql
  EXPLAIN (ANALYZE, BUFFERS)
  SELECT to_char("occurredAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date,
         channel,
         count(*) FILTER (WHERE status = 'processed') AS processed,
         count(*) FILTER (WHERE status = 'failed') AS failed
  FROM "GoogleAdsConversionEvent"
  WHERE "workspaceId" = $1 AND "occurredAt" >= $2 AND "occurredAt" <= $3
  GROUP BY 1, channel;
  ```

  Expect an index scan on `GoogleAdsConversionEvent_workspaceId_occurredAt_idx`; the
  follow-up trigger stays p95 > 500 ms (candidate `(workspaceId, occurredAt, status)`).

### S2 (dashboard)

- Files: `app/space/[workspaceId]/dashboard/ads/google/{page,loading,error}.tsx`,
  `features/integration-google-ads/components/stats/*` (`GoogleAdsStatsView`, tiles, chart,
  by-action table, breakdowns, filters, skeleton), `hooks/use-stats-filters.ts`,
  `schema/stats-search-params.ts`, `lib/stats-buckets.ts` and `stats-format.ts`,
  `features/analytics/lib/google-ads-dashboard-entry.ts`, `showGoogleAds` in `AnalyticsNav`,
  and the "View statistics" link in `events-history-section.tsx`.
- Deviations from the proposal: the response schema is in `packages/business`
  (`stats-schema.ts`), not in a builder `schema/stats.ts`; the page passes the constant
  `showGoogleAds` (the resolver serves the contacts, conversations and Meta pages);
  `error.tsx` uses Next's `retry` prop, logs nothing (Next logs the server failure) and
  links back with the existing `fields.analytics.label`; the action select merges the
  synced actions with the actions in the stats; chart series use semantic colours; the
  by-action table has five bucket columns (confirmed, awaiting, queued, failed, skipped);
  an unknown `channel` or a non-numeric `action` parses to `null` ("all"); the
  browser `tz` is added once with `router.replace` when the URL has none.
- i18n: the §5.4 key list equals `googleAds.stats.*` and `ads.dashboardNav.google` in
  `messages/en.json` (43 keys, diffed), in all locales.
- The preset label of the date control is classified in the resolved `range.tz`
  (`integration-google-ads/lib/stats-preset.ts`), not with the shared `resolvePresetOption`,
  which reads the runtime's local "today" and hydrates to a different label around midnight.
  The shared control is unchanged (Meta keeps its behaviour); the page passes its own
  reference instant to it, and a hydration test covers both.

### S3 (public API)

- `features/integration-google-ads/api/public.ts` (three GETs, scope `ads`, registered as
  `googleAds`), request schemas in `schema/public.ts`, shared helpers
  `lib/list-google-ads-events.ts` (`listGoogleAdsEventResources`) and
  `lib/load-google-ads-integration.ts` (`loadGoogleAdsIntegration`), used by the private and
  the public handlers so both call the same service methods. `toGoogleAdsEventResource` also
  redacts the row's `transactionId` and `requestId` from `error`; `googleAdsEventResource`
  carries `conversionActionId`.
- `perPage` is capped at 50 (`publicListRequest`; 51 is a 422) while the private history
  keeps `GOOGLE_ADS_EVENTS_MAX_PER_PAGE` (100) and clamps. Hidden MCP (no `mcpSpec`); CLI
  `google-ads stats|events|connection`. Parity manifest reasons, CLI README and
  `docs/developer/workspace-api-tokens.md` updated.
- The `getStats` handler echoes the resolved `range` (no 422 for inverted or oversized
  ranges).

### S4 (docs)

- `docs/google-ads-conversion-tracking.md` (section "Statistics and public API" and a UI map
  row), `docs/google-ads-conversion-options-admin-guide.md` (section "Reading the dashboard";
  the legacy section became 9), and this plan (status, §3.1 offset zones, §3.4, §4.1 schema
  location, §5.1 and §5.2 wording, the by-action columns). The `AGENTS.md` docs line for the tracking doc mentions the
  statistics dashboard and public API (outside the mirrored invariants block).

