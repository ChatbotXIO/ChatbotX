# Marketing Messages Statistics Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Statistics tab to Marketing Messages that shows Meta's insights for the workspace's campaigns: one ad account at a time, searchable, filterable by date range, with a sticky footer that holds Meta's aggregate for the current page. The same data is exposed as a public API procedure.

**Architecture:** Campaign rows come from our DB (search, sort and pagination run in the repository). For each page, the shared operation `getMarketingMessagesStatistics` makes two `act_<id>/insights` Graph calls filtered to the page's campaign ids: one at `level=campaign` for the rows and one at `level=account` for the footer aggregate. Both calls are cached in Redis for 10 minutes. The public procedure and the private procedure both call that one operation, and the client tab reads the private one through TanStack Query.

**Tech Stack:** Next.js 16 / React 19, oRPC, Drizzle, `@chatbotx.io/redis` `withCache`, ky Graph client in `integrations/facebook-ads`, vitest + msw, next-intl.

**Spec:** `docs/superpowers/specs/2026-10-20-marketing-messages-statistics-design.md` (decisions U1–U16 and C1–C6 are cited by id below)

## Global Constraints

- Chain is `handler → lib operation → service → repository → DB`; no `db` import in `apps/` (AGENTS.md invariant 9).
- Public procedure first, private procedure and UI after; both call the same `lib/statistics-operations.ts` function (invariant 23). Run the `cli-mcp-docs` skill after the public API lands.
- No dynamic `import()` in `integrations/facebook-ads` or `packages/*`.
- Logger key is `err` (invariant 20). All UI strings via `useTranslations()` under `facebookMarketingMessages.statistics.*` (invariant 7).
- Missing metric = `null` → rendered `-`. `0` only when Meta returned 0. Never coerce missing to 0 (spec anti-goal; note the existing `toFiniteNumber` in `insights.ts` DOES coerce to 0 — do not reuse it).
- Insights money is in **major units** (`"38.87"`); never divide by `currencyOffset`.
- Never more than two insights Graph calls per uncached page view; never one call per campaign.
- Each view shows one ad account, so one currency (U5).
- No DB migration in this plan.
- After every task: `pnpm fix`, then the task's tests. Before finishing: `pnpm lint` and `check-types` for each touched workspace.
- Stage files explicitly; never `git add -A` / `git add .`.

## Review Focus

1. **Search matches nothing.** Expect an empty table, a footer reading "Total: 0 campaigns" with `-` cells, and **no Graph call**. Test: Task 4, `returns empty rows and null aggregate without calling Graph when the page is empty`.
2. **Workspace has no campaigns at all.** Expect `adAccountId: null`, an empty `adAccounts` list, no Graph call, and an empty state instead of a crash. Test: Task 4, `returns an empty result when the workspace has no campaigns`.
3. **`since` is after `until`, or the range is longer than 37 months.** Expect a 400 validation error, not a Graph error. Test: Task 4, `rejects since after until and ranges over 37 months`.
4. **A campaign has data but Meta omits a field for it** (EU/Japan exclusion). That cell is `-` and the other cells still show. Test: Task 2, `maps absent marketing_messages_* fields to null, not 0`.
5. **Two workspaces share an ad account.** One workspace must never see the other's campaigns or cached numbers, so the cache key contains `workspaceId`. Test: Task 4, `cache keys include workspaceId and the sorted campaign ids`.

---

### Task 1: Verify Meta's aggregate behaviour (gate, no code)

Spec C3. The rest of the plan assumes both answers below are "yes". If either is "no", **stop and report to the user** and do not start Task 2 (spec U4: do not fall back to computing the averages ourselves).

**Files:**
- Modify: `docs/superpowers/specs/2026-10-20-marketing-messages-statistics-design.md` (add a "Verified" note under the ⚠️ block)

- [ ] **Step 1: Get a token and ids.** Take a workspace with at least two sent Marketing Messages campaigns on one ad account. Use the decrypted grant access token (`facebookMarketingMessagesService.decryptAuth`), or ask the user for a Graph Explorer token that has `ads_read`. Collect two `campaignId`s and the `act_<id>`.

- [ ] **Step 2: Per-campaign call.**

```bash
curl -G "https://graph.facebook.com/<VERSION>/act_<ID>/insights" \
  --data-urlencode "level=campaign" \
  --data-urlencode "fields=campaign_id,account_currency,marketing_messages_delivered,marketing_messages_read_rate,marketing_messages_link_btn_click,marketing_messages_link_btn_click_rate,marketing_messages_cost_per_link_btn_click,marketing_messages_cost_per_delivered,marketing_messages_spend" \
  --data-urlencode "time_range={\"since\":\"<YYYY-MM-DD>\",\"until\":\"<YYYY-MM-DD>\"}" \
  --data-urlencode "filtering=[{\"field\":\"campaign.id\",\"operator\":\"IN\",\"value\":[\"<C1>\",\"<C2>\"]}]" \
  --data-urlencode "access_token=<TOKEN>"
```

Expected: one `data[]` entry per campaign with data, each with `campaign_id` and the `marketing_messages_*` fields.

- [ ] **Step 3: Aggregate call.** Same request with `level=account` and without `campaign_id` in `fields`. Expected: exactly one `data[]` entry, whose `marketing_messages_delivered` equals the sum from Step 2 and whose `marketing_messages_spend` equals the summed spend.

- [ ] **Step 4: Record the result.** Write the actual request/response shapes under the ⚠️ block in the spec, including anything unexpected (missing fields, string vs number). If Step 2 or 3 fails, stop here and report to the user.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-20-marketing-messages-statistics-design.md
git commit -m "docs(fb-marketing-messages): record verified insights aggregate behaviour"
```

---

### Task 2: Integration — insights reads + ad account timezone

**Files:**
- Create: `integrations/facebook-ads/src/apis/marketing-messages-insights.ts`
- Modify: `integrations/facebook-ads/src/index.ts` (add `export * from "./apis/marketing-messages-insights"`)
- Modify: `integrations/facebook-ads/src/apis/ad-accounts.ts:124-165` (`MarketingMessagesAdAccount` gains `timezoneName: string | null`; add `timezone_name` to `fields`)
- Test: `integrations/facebook-ads/__tests__/marketing-messages-insights.test.ts` (new)
- Test: `integrations/facebook-ads/__tests__/marketing-messages-ad-accounts.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
export type MarketingMessagesInsightMetrics = {
  delivered: number | null       // marketing_messages_delivered
  readRate: number | null        // marketing_messages_read_rate (percent, e.g. 24.766355)
  linkClicks: number | null      // marketing_messages_link_btn_click
  linkClickRate: number | null   // marketing_messages_link_btn_click_rate (percent)
  costPerClick: number | null    // marketing_messages_cost_per_link_btn_click (major units)
  costPerDelivery: number | null // marketing_messages_cost_per_delivered (major units)
  spend: number | null           // marketing_messages_spend (major units)
}
export type MarketingMessagesCampaignInsight = MarketingMessagesInsightMetrics & {
  campaignId: string
  currency: string | null // account_currency
}
export type GetMarketingMessagesInsightsInput = {
  accessToken: string
  adAccountId: string      // act_<id>
  campaignIds: string[]
  since: string            // YYYY-MM-DD
  until: string            // YYYY-MM-DD
  version?: string
}
export function getMarketingMessagesCampaignInsights(
  input: GetMarketingMessagesInsightsInput,
): Promise<MarketingMessagesCampaignInsight[]>
export function getMarketingMessagesAggregateInsights(
  input: GetMarketingMessagesInsightsInput,
): Promise<(MarketingMessagesInsightMetrics & { currency: string | null }) | null>
// MarketingMessagesAdAccount gains: timezoneName: string | null
```

- [ ] **Step 1: Write the failing tests** in `marketing-messages-insights.test.ts`, using the msw setup from `messaging-ads-insights.test.ts`:
  - `returns [] / null without calling Graph when campaignIds is empty`: both functions; the handler throws if hit.
  - `campaign call: one request, level=campaign, campaign.id IN filter, time_range`: assert `callCount === 1`, `level === "campaign"`, `JSON.parse(filtering)` equals `[{ field: "campaign.id", operator: "IN", value: ["c1","c2"] }]`, `JSON.parse(time_range)` equals `{ since: "2026-09-21", until: "2026-10-20" }`, no `date_preset` param, and `fields` contains every `marketing_messages_*` field plus `campaign_id,account_currency`.
  - `parses string metrics to numbers`: the response row `{ campaign_id: "c1", account_currency: "VND", marketing_messages_delivered: "428", marketing_messages_read_rate: "24.766355", marketing_messages_spend: "123566" }` gives `{ campaignId: "c1", currency: "VND", delivered: 428, readRate: 24.766355, spend: 123566, … }`.
  - `maps absent marketing_messages_* fields to null, not 0`: the row `{ campaign_id: "c1", marketing_messages_spend: "290" }` gives `delivered: null, readRate: null, linkClicks: null, linkClickRate: null, costPerClick: null, spend: 290`. Also `"0"` gives `0`.
  - `aggregate call uses level=account and returns the single row`: assert `level === "account"`, that `fields` lacks `campaign_id`, and the parsed metrics.
  - `aggregate returns null when Meta returns no rows`: `data: []` gives `null` (spec C4).
  - Graph error: a 400 `{ error: { code: 100 } }` rejects with `FacebookAdsException` (through `rescue`).

  In `marketing-messages-ad-accounts.test.ts`: assert that `fields` includes `timezone_name`, that `timezone_name: "Asia/Ho_Chi_Minh"` maps to `timezoneName: "Asia/Ho_Chi_Minh"`, and that an absent value maps to `null`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @chatbotx.io/integration-facebook-ads test -- marketing-messages-insights marketing-messages-ad-accounts`
Expected: FAIL (module not found / `timezoneName` undefined).

- [ ] **Step 3: Implement.** In the new file, use `fetchAllPages` from `./ad-accounts` (it is already exported there) together with `rescue` and `ADS_PAGE_LIMIT`. Pass `time_range` and `filtering` as `JSON.stringify(...)`. Use a zod row schema in which every metric is `z.union([z.string(), z.number()]).optional()`, and a local `toNullableNumber(value): number | null` that returns `null` for `undefined`, `""` or non-finite values. The aggregate function requests `level=account` and returns `rows[0]` or `null`. Do not add the functions to the `integration.ts` handler map; the builder calls them directly, as `campaign-operations.ts` does.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `pnpm --filter @chatbotx.io/integration-facebook-ads test && pnpm --filter @chatbotx.io/integration-facebook-ads check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add integrations/facebook-ads/src/apis/marketing-messages-insights.ts integrations/facebook-ads/src/apis/ad-accounts.ts integrations/facebook-ads/src/index.ts integrations/facebook-ads/__tests__/marketing-messages-insights.test.ts integrations/facebook-ads/__tests__/marketing-messages-ad-accounts.test.ts
git commit -m "feat(facebook-ads): marketing messages insights reads and ad account timezone"
```

---

### Task 3: Repository + service — paginated statistics listing and ad-account list

**Files:**
- Modify: `packages/database/src/repositories/facebook-marketing-messages/repository.ts` (two methods)
- Modify: `packages/business/src/facebook-marketing-messages/service.ts` (two pass-through methods)
- Test: `packages/business/__tests__/facebook-marketing-messages-service.test.ts` (extend; add both methods to the mocked `campaignRepository`)

**Interfaces:**
- Produces (repository, mirrored 1:1 on `facebookMarketingMessagesService`):

```ts
export type MarketingMessageStatisticsListInput = {
  workspaceId: string
  adAccountId: string
  search?: string
  page?: number
  perPage?: number
  sort?: { id: "campaignId" | "name"; desc: boolean }[]
}
listForStatistics(input: MarketingMessageStatisticsListInput, tx?):
  Promise<{ data: FacebookMarketingMessageModel[]; total: number; pageCount: number }>

listAdAccountsByWorkspaceId(workspaceId: string, tx?):
  Promise<{ adAccountId: string; currency: string; timezoneName: string | null }[]>
  // one entry per distinct adAccountId, ordered by that account's newest
  // campaign createdAt DESC (index 0 = the U12 default); currency/timezoneName
  // taken from that newest campaign row (spec C6 fallback)
```

- [ ] **Step 1: Write the failing service tests**
  - `listForStatistics delegates to the repository with the input unchanged`: the mock returns `{ data: [], total: 0, pageCount: 0 }`, and the service returns the same value.
  - `listAdAccountsByWorkspaceId delegates to the repository`: same pattern.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @chatbotx.io/business test -- facebook-marketing-messages-service`
Expected: FAIL (`is not a function`).

- [ ] **Step 3: Implement the repository methods.** Follow `appointmentCalendarRepository.list` (`packages/database/src/repositories/appointment-calendar/repository.ts:76-104`):
  - `where = and(eq(workspaceId), eq(adAccountId), search ? or(eq(campaignId, search.trim()), ilike(name, likeContains(search.trim()))) : undefined)`. This is spec C1: an exact match on Meta's id, or a substring match on the name.
  - Order with `parseOrderBy(model, input, new Set(["campaignId", "name"]))` and fall back to `desc(createdAt)`. Count with `tx.$count`. Paginate with `getPaginationWithDefaults`.
  - `listAdAccountsByWorkspaceId`: use `selectDistinctOn([adAccountId])` ordered by `adAccountId, createdAt desc`, then sort in JS by that row's `createdAt` desc. Either that or an equivalent single query is fine.
  - The service methods are one-line delegations, like the existing `list`.

- [ ] **Step 4: Run tests, then typecheck**

Run: `pnpm --filter @chatbotx.io/business test -- facebook-marketing-messages-service && pnpm --filter @chatbotx.io/database check-types && pnpm --filter @chatbotx.io/business check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/repositories/facebook-marketing-messages/repository.ts packages/business/src/facebook-marketing-messages/service.ts packages/business/__tests__/facebook-marketing-messages-service.test.ts
git commit -m "feat(fb-marketing-messages): paginated statistics listing and ad account list"
```

---

### Task 4: Statistics operation (date range + merge + cache)

**Files:**
- Create: `apps/builder/src/features/facebook-marketing-messages/lib/statistics-range.ts` (pure, **no** `server-only`, also imported by the client)
- Create: `apps/builder/src/features/facebook-marketing-messages/schema/statistics.ts`
- Create: `apps/builder/src/features/facebook-marketing-messages/lib/statistics-operations.ts` (`import "server-only"`)
- Test: `apps/builder/__tests__/marketing-messages-statistics-range.test.ts`
- Test: `apps/builder/__tests__/marketing-messages-statistics.test.ts`

**Interfaces:**
- Consumes: Task 2 functions/types; Task 3 service methods; `requireValidGrant` (`lib/grant.ts`) → `{ accessToken, version }`; `withCache` from `@chatbotx.io/redis`.
- Produces:

```ts
// lib/statistics-range.ts
export const STATISTICS_PRESETS = ["last7", "last30", "last90", "thisMonth", "lastMonth"] as const
export type StatisticsPreset = (typeof STATISTICS_PRESETS)[number]
export const STATISTICS_MAX_RANGE_MONTHS = 37
export function todayInTimeZone(timeZone: string, now?: Date): string        // YYYY-MM-DD
export function statisticsPresetRange(preset: StatisticsPreset, timeZone: string, now?: Date):
  { since: string; until: string }
// lastN = since today-(N-1) … until today (today INCLUDED, so a campaign sent
// today shows up by default); thisMonth = 1st … today; lastMonth = full previous month.

// schema/statistics.ts
export const statisticsInputSchema = z.object({
  adAccountId: z.string().regex(/^act_\d+$/).optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // YYYY-MM-DD, ad account timezone
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(200).optional(),
  page, perPage,                    // from publicListRequest (apps/builder/src/lib/public-api/list.ts)
  sort: z.enum(["campaignId", "name"]).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
})
export const statisticsMetricsSchema   // 7 metrics, each z.number().nullable()
export const statisticsOutputSchema = z.object({
  adAccountId: z.string().nullable(),
  adAccounts: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
  currency: z.string().nullable(),
  timezone: z.string(),
  since: z.string(), until: z.string(),
  rows: z.array(statisticsMetricsSchema.extend({
    id: z.string(), campaignId: z.string(), name: z.string(), pageId: z.string(),
  })),
  aggregate: statisticsMetricsSchema.nullable(),
  aggregateUnavailable: z.boolean(),   // spec C5
  pagination: z.object({ page, perPage, total, pageCount }),
})
export type StatisticsInput / StatisticsOutput  (z.infer)

// lib/statistics-operations.ts
export async function getMarketingMessagesStatistics(
  workspace: WorkspaceModel, input: StatisticsInput, now?: Date,
): Promise<StatisticsOutput>
```

- [ ] **Step 1: Write the failing range tests** (`marketing-messages-statistics-range.test.ts`), with `now = new Date("2026-10-20T20:00:00Z")`:
  - `todayInTimeZone` returns `"2026-10-21"` for `Asia/Ho_Chi_Minh` (UTC+7) and `"2026-10-20"` for `America/Los_Angeles`.
  - `last30` in `America/Los_Angeles` → `{ since: "2026-09-21", until: "2026-10-20" }`.
  - `thisMonth` → `{ since: "2026-10-01", until: "2026-10-20" }`; `lastMonth` → `{ since: "2026-09-01", until: "2026-09-30" }`.
  - `last7` across a month boundary, with `now = 2026-03-03T12:00:00Z` in `UTC` → `{ since: "2026-02-25", until: "2026-03-03" }`.

- [ ] **Step 2: Write the failing operation tests** (`marketing-messages-statistics.test.ts`). Mock `@chatbotx.io/business` (service), `@chatbotx.io/integration-facebook-ads` (the 2 insights fns, `getMarketingMessagesAdAccounts`, real `FacebookAdsException`), `../lib/grant` and `@chatbotx.io/redis` (`withCache: (key, fn) => fn()`, recording keys). Follow the mocking style of `marketing-messages-public-api.test.ts`. Cases:
  - `returns an empty result when the workspace has no campaigns`: `listAdAccountsByWorkspaceId → []` gives `adAccountId: null, adAccounts: [], rows: [], aggregate: null`, and no insights call.
  - `defaults to the newest campaign's ad account and last 30 days in its timezone` (U12, U13): the accounts `[act_2 (tz Asia/Ho_Chi_Minh), act_1]` with no input select `adAccountId: "act_2"`, `timezone: "Asia/Ho_Chi_Minh"`, and `since`/`until` equal to `statisticsPresetRange("last30", tz, now)`.
  - `uses Meta timezone when the grant sees the account, else the stored one, else UTC` (C6): three sub-cases.
  - `rejects an adAccountId the workspace has no campaigns on`: throws `ChatbotXException` with status 400. This stops callers from reading arbitrary ad accounts through our grant.
  - `rejects since after until and ranges over 37 months`: both throw a 400 `ChatbotXException`, and no Graph call is made.
  - `returns empty rows and null aggregate without calling Graph when the page is empty`.
  - `merges insights onto every page row; campaigns without insights get all-null metrics` (U1): with page rows `c1, c2, c3` and insights only for `c1`, the output has 3 rows in DB order and `c2`/`c3` have all metrics `null`.
  - `passes only the current page's campaign ids to both insights calls` (U3).
  - `aggregate failure is a partial success` (C5): the aggregate mock rejects with `FacebookAdsException` and the rows call resolves. Result: `aggregate: null`, `aggregateUnavailable: true`, rows present. A failing rows call makes the whole operation reject.
  - `cache keys include workspaceId and the sorted campaign ids`: the recorded keys contain `workspace.id`, `adAccountId`, `since`, `until`, `campaign`/`account`, and the same hash for `[c2,c1]` and `[c1,c2]`. TTL is `600`.
  - `currency comes from Meta account_currency, else the stored campaign currency`.
  - `adAccounts lists every workspace account with Meta name when visible, else null name` (C6).

- [ ] **Step 3: Run them and confirm they fail**

Run: `pnpm --filter builder test -- marketing-messages-statistics`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `statistics-range.ts`.** Use `Intl.DateTimeFormat("en-CA", { timeZone })` for today. Do the date arithmetic on UTC `Date`s built from `YYYY-MM-DD`, using `date-fns` (already a builder dependency).

- [ ] **Step 5: Implement `getMarketingMessagesStatistics`**, in this order:
  1. `requireValidGrant(workspace)`.
  2. Run `listAdAccountsByWorkspaceId` and `getMarketingMessagesAdAccounts(grant.accessToken, grant.version)` in parallel. Wrap the second in `withCache` (key `mm-stats:accounts:{workspaceId}`, TTL 600).
  3. Resolve `adAccountId`: the input value must be in the workspace list, otherwise throw 400 (`facebookMarketingMessages.statistics.errors.unknownAdAccount`). With no input, use list[0]. With an empty list, return the empty result.
  4. Resolve the timezone (C6) and the range: the input or `last30`. Validate `since <= until` and a span of at most 37 months, otherwise throw 400 (`…errors.invalidRange`).
  5. Call `listForStatistics` with `sort: input.sort ? [{ id: input.sort, desc: input.order === "desc" }] : undefined`.
  6. If the page is empty, return without calling Graph. Otherwise run the two insights calls in parallel, each through `withCache(\`mm-stats:{workspaceId}:{adAccountId}:{since}:{until}:{campaign|account}:{sha1(sorted ids)}\`, fn, { ttl: 600 })`. Use `Promise.allSettled`. A rejected rows call re-throws through `withMmDeliveryErrors`, the existing error translation in `lib/delivery-errors.ts`. A rejected aggregate call is logged with `logger.warn({ err }, …)` and gives `aggregateUnavailable: true`.
  7. Merge by `campaignId`. The currency is the first non-null `account_currency`, else the newest campaign's stored `currency`.

- [ ] **Step 6: Run tests and confirm they pass**

Run: `pnpm --filter builder test -- marketing-messages-statistics`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/builder/src/features/facebook-marketing-messages/lib/statistics-range.ts apps/builder/src/features/facebook-marketing-messages/lib/statistics-operations.ts apps/builder/src/features/facebook-marketing-messages/schema/statistics.ts apps/builder/__tests__/marketing-messages-statistics-range.test.ts apps/builder/__tests__/marketing-messages-statistics.test.ts apps/builder/messages/en.json
git commit -m "feat(fb-marketing-messages): statistics operation with cached Meta insights"
```

(The `en.json` error keys from Step 5 go in this commit. The rest of the UI copy arrives in Task 6.)

---

### Task 5: Public + private API procedures, CLI/MCP docs

**Files:**
- Modify: `apps/builder/src/features/facebook-marketing-messages/api/public.ts` (new `statistics: { get }` group in `facebookMarketingMessagesPublicRouter`)
- Modify: `apps/builder/src/features/facebook-marketing-messages/api/private.ts` (new `getMarketingMessagesStatisticsAPI`)
- Test: `apps/builder/__tests__/marketing-messages-public-api.test.ts` (extend)
- Docs: whatever the `cli-mcp-docs` skill says to update

**Interfaces:**
- Consumes: `getMarketingMessagesStatistics`, `statisticsInputSchema`, `statisticsOutputSchema` (Task 4).
- Produces:
  - Public: `facebookMarketingMessages.statistics.get`, `GET /v1/marketing-messages/statistics`, `ads` scope (the existing `workspaceTokenAuthAPI` in that file). Input `statisticsInputSchema`; output `statisticsOutputSchema`.
  - Private: `facebookMarketingMessagesAPI.getMarketingMessagesStatisticsAPI`, `GET /workspaces/{workspaceId}/fb-marketing-messages/statistics`. Input is `withWorkspaceIdSchema.merge(statisticsInputSchema)`, and the handler calls `getMarketingMessagesStatistics(context.workspace, input)`. The client calls it via `orpc.facebookMarketingMessagesAPI.getMarketingMessagesStatisticsAPI.queryOptions(...)`.

- [ ] **Step 1: Write the failing tests** in `marketing-messages-public-api.test.ts`, extending its captured-procedure harness:
  - `statistics.get route is GET /v1/marketing-messages/statistics`.
  - `description names where ids come from`: the `route.description` contains `facebookMarketingMessages.adAccounts.list` and `facebookMarketingMessages.campaigns.list`, and states the default range (last 30 days in the ad account timezone) and that metrics are `null` when Meta has no data.
  - `input rejects a malformed adAccountId and sort outside campaignId|name`: `safeParse({ adAccountId: "123" }).success === false` and `safeParse({ sort: "spend" }).success === false` (U9).
  - `handler delegates to getMarketingMessagesStatistics with context.workspace and input` (mock `../lib/statistics-operations`).

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter builder test -- marketing-messages-public-api`
Expected: FAIL

- [ ] **Step 3: Implement both procedures.** The summary is "Get Marketing Messages statistics". Write the description per the test above, and also mention `aggregate` (Meta's totals and averages for the returned page) and `aggregateUnavailable`. Use `.errors(possibleErrorsOnListingResource)` as `campaigns.list` does.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter builder test -- marketing-messages-public-api && pnpm --filter builder check-types`
Expected: PASS

- [ ] **Step 5: Run the `cli-mcp-docs` skill** and apply the updates it asks for.

- [ ] **Step 6: Commit** the API files, the test, and the doc files the skill touched (list them explicitly).

```bash
git commit -m "feat(fb-marketing-messages): statistics public and private API"
```

---

### Task 6: Statistics tab UI

**Files:**
- Modify: `apps/builder/src/features/facebook-marketing-messages/lib/tab.ts` (`MarketingMessagesTab` adds `"statistics"`; parse + build handle it; `buildTabSearchParams` also deletes `adAccountId`, `since`, `until`, `search`, `order`)
- Modify: `apps/builder/src/features/facebook-marketing-messages/components/marketing-messages-tabs.tsx` (third trigger + `statistics: ReactNode` slot; give all three triggers icons as in the mockup)
- Modify: `apps/builder/src/features/facebook-marketing-messages/components/marketing-messages-view.tsx` (pass `<StatisticsTable readOnly={readOnly} workspaceId={workspaceId} />`)
- Create: `apps/builder/src/features/facebook-marketing-messages/components/statistics/statistics-table.tsx`
- Create: `apps/builder/src/features/facebook-marketing-messages/components/statistics/statistics-toolbar.tsx`
- Create: `apps/builder/src/features/facebook-marketing-messages/lib/statistics-format.ts` (pure formatters)
- Modify: `apps/builder/messages/en.json` (`facebookMarketingMessages.tabs.statistics`, `facebookMarketingMessages.statistics.*`), plus any other locale files `pnpm --filter builder i18n:check` requires
- Test: `apps/builder/__tests__/marketing-messages-tab.test.ts` (extend)
- Test: `apps/builder/__tests__/marketing-messages-statistics-format.test.ts` (new)

**Interfaces:**
- Consumes: the private procedure from Task 5; `StatisticsOutput`; `statisticsPresetRange`, `STATISTICS_PRESETS` (Task 4); `useMarketingMessagesNameLookups` (`pageNameById`).
- Produces:

```ts
// lib/statistics-format.ts
export function formatStatCount(value: number | null, locale: string): string   // "-" for null; integer grouping
export function formatStatRate(value: number | null, locale: string): string    // "-" for null; 2 decimals + "%"
export function formatStatMoney(value: number | null, currency: string | null, locale: string): string
  // "-" for null; Intl currency, fraction digits = 0 for ZERO_DECIMAL_CURRENCIES (lib/currency.ts), else 2
```

- [ ] **Step 1: Write the failing tests**
  - Tab: `parseMarketingMessagesTab("statistics") === "statistics"`; `buildTabSearchParams("adAccountId=act_1&since=2026-01-01&until=2026-01-31&search=x&page=2", "statistics").toString() === "tab=statistics"`; switching to `campaigns` from `tab=statistics&since=…` gives `""`.
  - Format: `formatStatCount(null,"en") === "-"`; `formatStatCount(0,"en") === "0"`; `formatStatRate(24.766355,"en") === "24.77%"`; `formatStatMoney(123566,"VND","vi")` contains `"123.566"` and `"₫"`; `formatStatMoney(38.87,"USD","en") === "$38.87"`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter builder test -- marketing-messages-tab marketing-messages-statistics-format`
Expected: FAIL

- [ ] **Step 3: Implement `tab.ts` and `statistics-format.ts`**, then run Step 2 again. Expected: PASS.

- [ ] **Step 4: Build the toolbar and table.**
  - URL state: `adAccountId`, `since`, `until`, `search` (debounced 300 ms), `page`, `perPage`, `sort`/`order`. Use `useDataTable` for page and sort, as `marketing-messages-table.tsx:241` does, with only the `campaignId` and `name` columns sortable (U9).
  - Query: `useQuery(orpc.facebookMarketingMessagesAPI.getMarketingMessagesStatisticsAPI.queryOptions({ input: { workspaceId, ...urlState } }))` with `enabled: !readOnly`. The query key must include every filter. When `readOnly` (expired grant, U10), render an empty state and make no query.
  - Toolbar: a search input on the left (placeholder "Search by ID or name"). On the right: the ad-account `Select`, built from `data.adAccounts` and labelled with the name or the raw `act_…` (C6), hidden when there is only one account; then the date range picker, reusing `packages/ui/src/components/data-table/data-table-date-filter.tsx` or `features/booking-webview/components/date-range-picker.tsx` (do not create a new picker), with `STATISTICS_PRESETS`; then a muted hint "Dates in {timezone}". When `since`/`until` are absent from the URL, show the server-echoed `data.since`/`data.until` (U13).
  - Columns (U8, C1): ID = `campaignId`; Name; Facebook Page = `pageNameById[pageId] ?? pageId`; then the 7 metric columns, right-aligned and using the formatters. Each metric header has a tooltip explaining the regional exclusions (U15). Pin ID and Name on the left; the metrics scroll horizontally.
  - Sticky footer (U2, U3, U14): the left cell reads `t("…statistics.footer.total", { count: rows.length })` → "Total: {count} campaigns". Each metric cell shows `aggregate` formatted, with a caption "Total" under delivered, link clicks and spend, and "Average" under the other four. With `aggregate === null`, every cell shows `-` (C4). With `aggregateUnavailable`, add an inline muted "Totals unavailable — try again shortly" (C5).
  - States: skeleton rows while loading; an inline error from the oRPC error message; an empty state when `adAccountId === null` ("No campaigns yet").
  - Row click does nothing (U11). This is a read-only query, so there is nothing to invalidate.

- [ ] **Step 5: Add the i18n keys** and run `pnpm --filter builder i18n:check`. Add whatever locale files it reports.

- [ ] **Step 6: Visual check.** Run the builder (`run` skill), open Marketing Messages → Statistics, and confirm the following match the mockup: the tab, the toolbar, the pinned columns, the sticky footer, `-` cells, the default "last 30 days" and the timezone hint. Also switch tabs and confirm the statistics params are dropped. If no Meta-connected workspace is available locally, say so in the hand-off rather than claiming the check was done.

- [ ] **Step 7: Commit** (list every file explicitly)

```bash
git commit -m "feat(fb-marketing-messages): statistics tab"
```

---

### Task 7: Final verification

- [ ] **Step 1:** `pnpm fix && pnpm lint`. Expected: exit 0.
- [ ] **Step 2:** `pnpm --filter builder check-types && pnpm --filter @chatbotx.io/business check-types && pnpm --filter @chatbotx.io/database check-types && pnpm --filter @chatbotx.io/integration-facebook-ads check-types`. Expected: exit 0.
- [ ] **Step 3:** `pnpm --filter builder test -- marketing-messages && pnpm --filter @chatbotx.io/integration-facebook-ads test && pnpm --filter @chatbotx.io/business test -- facebook-marketing-messages`. Expected: all pass.
- [ ] **Step 4:** Dispatch the `invariant-guard` agent on the branch diff and fix any violations it reports.
- [ ] **Step 5:** If Steps 1–4 changed files, commit them with `chore(fb-marketing-messages): lint and invariant fixes`.
