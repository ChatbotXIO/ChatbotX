# Marketing Messages — Statistics tab

Date: 2026-10-20
Feature: `apps/builder/src/features/facebook-marketing-messages`
Branch context: `feat/fb-marketing-messages-custom-audience`

## Intent

The Marketing Messages tool has two tabs today: **Campaign** and **Audience**.
Users create campaigns there but have no way to see how they performed without
going to Meta Ads Manager. Add a third tab, **Statistics**, that shows Meta's
performance insights for the campaigns created in the Campaign tab, in one
table, filterable by name/ID and date range.

Source of numbers: Meta's Marketing Messages insights
(<https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/measure-performance>).

Reference mockup (user-provided screenshot): a tab strip `Campaign | Audience |
Statistics`; a toolbar with "Search by ID or name" on the left and a
start→end date range on the right; a table with columns ID, Name, Messages
delivered, Read rate, Link clicks, Link click rate, Cost per click, Cost per
delivery, Amount spent; `-` for campaigns with no data; and a footer row
"Total: N …" with per-column `Total` / `Average` values. The mockup's
Download button is **out of scope** (see Non-goals).

## Goals

- A **Statistics** tab (`?tab=statistics`) alongside Campaign and Audience.
- One row per **workspace campaign** (our `FacebookMarketingMessage` rows) for
  the selected ad account — every campaign is listed, even with no data in the
  range (shown as `-`).
- Search by campaign **ID or name**.
- Date range filter, **default last 30 days**, with presets.
- An **ad account selector**, so a view is always one currency.
- A **sticky footer total row** that aggregates the **current page only**.
- A **public API procedure** returning the same data as the table (built
  first; AGENTS.md invariant 23). The UI calls the same lib function.

## Non-goals

- **Download / export** — dropped from v1 (the mockup's button is not built).
- Pixel / offsite conversions (`actions`, `action_values`,
  `website_purchase_roas`).
- A campaign-status column.
- Campaigns created outside ChatbotX (e.g. directly in Ads Manager).
- Sorting by metric columns.
- Clicking a row (no navigation, no Ads Manager link). Rows are read-only.
- Persisting insights in our database / a sync worker.

## Anti-goals (would be a failure even if it "works")

- Mixing currencies in one view or one total (e.g. adding VND and USD spend).
- Showing `0` where Meta returned nothing — `0` must mean Meta said 0.
- One Graph call per campaign (N+1) — this will hit rate limits on real
  workspaces.
- A UI-only feature with no public API.
- A second implementation of the insights read for the UI vs the API.

## Decisions (made by the user)

| # | Decision |
|---|----------|
| U1 | Rows = all workspace campaigns (scoped to the selected ad account); no data → `-`. |
| U2 | Total row is a **sticky footer**, always visible while scrolling. |
| U3 | Total row covers the **current page only**. |
| U4 | Total/average cells are **fetched from Meta** as an aggregate (not computed by us). |
| U5 | **Ad account selector**; one account (one currency) at a time. |
| U6 | Freshness: **live Meta call with a short Redis cache**; no new DB table. |
| U7 | **No download** in v1. |
| U8 | Columns: ID, Name, **Facebook Page**, Messages delivered, Read rate, Link clicks, Link click rate, Cost per click, Cost per delivery, Amount spent. |
| U9 | **Only ID and Name are sortable.** Metric columns have no sort arrows. |
| U10 | Expired grant → show the existing expired `GrantPanel` and an empty state in this tab (no stale numbers). Missing grant → whole view is the `GrantPanel`, as today. |
| U11 | Row click does nothing. |
| U12 | Default ad account = the ad account of the workspace's **most recently created** campaign; kept in the URL. |
| U13 | Date picker: range + presets (Last 7 / 30 / 90 days, This month, Last month), interpreted in the **ad account's timezone** (shown as a hint). |
| U14 | Footer label counts **campaigns on this page** ("Total: 10 campaigns"). |
| U15 | Missing metric → `-`, everywhere. Metric column headers get a tooltip explaining regional exclusions (Europe/Japan have no delivered/read data; Europe, Argentina, Turkey, South Korea, Japan have no click data). |
| U16 | Public API returns the same shape as the table: input ad account, date range, search, page/perPage, sort; output rows + page aggregate + currency. |

## How it works

### Meta calls (one per page view, two Graph calls)

Both go to `act_<adAccountId>/insights` with the selected `time_range`
(`{since, until}` as `YYYY-MM-DD`), filtered to the **current page's campaign
ids** (`filtering=[{field:"campaign.id",operator:"IN",value:[...]}]`), with
fields:

```
campaign_id, account_currency,
marketing_messages_delivered, marketing_messages_read_rate,
marketing_messages_link_btn_click, marketing_messages_link_btn_click_rate,
marketing_messages_cost_per_link_btn_click,
marketing_messages_cost_per_delivered, marketing_messages_spend
```

1. **Rows:** `level=campaign` → one insight row per campaign that had data.
   Campaigns absent from the response render `-` in every metric cell.
2. **Footer aggregate (U3, U4):** the same filter **without per-campaign
   level** (account level) → one row Meta aggregated over exactly those
   campaigns. Its delivered / link clicks / spend are the footer `Total`s;
   its read rate / link click rate / cost per click / cost per delivery are
   the footer `Average`s.

Mirror the existing pattern in
`integrations/facebook-ads/src/apis/insights.ts`
(`getMessagingAdsInsightsByAdIds`: `fetchAllPages`, `rescue`, zod row schema,
`toFiniteNumber`). Add a sibling function, e.g.
`getMarketingMessagesInsights({ accessToken, adAccountId, campaignIds,
since, until, level, version })`, exported from the integration package. An
empty `campaignIds` returns without calling Graph.

Meta returns metric values as strings. Parse to numbers; a missing or
unparsable field is `null` (→ `-`), never `0`.

Money: `marketing_messages_spend` / `cost_per_*` from Insights are in **major
units** (e.g. `"38.87"`), unlike the minor-unit budgets we send on create —
do not divide by `currencyOffset`. Format with the ad account currency
(`account_currency`, falling back to the campaign's stored `currency`).

> ⚠️ To verify during build: the "account-level aggregate filtered by
> `campaign.id IN`" approach (U4) is standard Ads Insights behaviour, but the
> Marketing Messages doc only shows `<campaign_id>/insights` and
> `act_<id>/insights` and does not mention `level`. Confirm with a real call
> that (a) `level=campaign` returns the `marketing_messages_*` fields per
> campaign and (b) the unlevelled filtered call returns one aggregated row.
> If (b) fails, stop and come back — do not silently fall back to computing
> averages ourselves, since the user chose Meta's aggregate.

> ✅ **Verified 2026-10-20** (Graph v23.0, `act_375866542517437`, user token):
> - Our stored `campaignId` is the **ad id** returned by `POST
>   act_<id>/message_campaign` (see `apis/message-campaigns.ts`); its node has
>   `campaign{id}` / `adset{id}` parents. So the filter is
>   **`ad.id IN [...]` at `level=ad`** (row field `ad_id`), not `campaign.id`
>   at `level=campaign` — which returns nothing for these ids.
> - With a filter present, Meta silently drops ads that are not ACTIVE
>   (archived/deleted/paused) — `data: []`. The filter must also include
>   `{field:"ad.effective_status",operator:"IN",value:[<every status>]}`.
> - With both filters, `level=account` returns ONE aggregated row over exactly
>   those ads: 97 + 20 impressions → `117`, spend 13868 + 3337 → `17205`,
>   `cpm` weighted (`147051.28`). Mechanism confirmed.
> - `marketing_messages_*` fields are accepted on `act_<id>/insights` (return
>   `"0"` for non-MM ads). The account's MM ads (sent 2026-10-18/19) had no
>   insights rows yet in any range, so MM-specific values were not observed.

### Data flow

```
Statistics tab (client, TanStack Query)
  → private oRPC procedure ─┐
public oRPC procedure ──────┴→ lib/statistics-operations.ts  (one implementation)
      ├─ requireValidGrant(workspace)
      ├─ facebookMarketingMessagesService: list workspace campaigns for
      │    adAccountId, filtered by search (id exact / name ILIKE),
      │    sorted (ID|Name), paginated → page of rows + total count
      ├─ withCache(key, ttl) → getMarketingMessagesInsights(level=campaign)
      ├─ withCache(key, ttl) → getMarketingMessagesInsights(aggregate)
      └─ merge → { rows, aggregate, currency, timezone, pagination }
```

- Campaign listing/search/sort/pagination happens **in our DB** through the
  service → repository chain (invariant 9). The existing
  `facebookMarketingMessagesService.list(workspaceId)` returns everything
  unpaginated; add a paginated, filtered read (or extend it) in
  `packages/business/src/facebook-marketing-messages`.
- Cache: `withCache` from `packages/redis/src/cache-utils.ts`. Key includes
  workspaceId, adAccountId, since, until, level and the sorted campaign-id
  list (hash it). TTL is the builder's call within 5–15 min.
- Ad account timezone: needed to compute "last 30 days" and the preset ranges
  and to show the hint. Read it from Meta's ad account (`timezone_name`)
  alongside the existing `getMarketingMessagesAdAccounts` call, and cache it.
  The client sends explicit `since`/`until` dates. The server computes the
  default range when they are omitted (last 30 days in the account timezone,
  ending today).
- Ad account selector options = the distinct `adAccountId`s across the
  workspace's campaigns, labelled with the account names from
  `getMarketingMessagesAdAccounts`. An account the current grant can no
  longer see is still listed (by id) but its query fails with the
  existing translated "not granted" error.

### Public API (build first)

In `features/facebook-marketing-messages/api/public.ts`, under the existing
`ads`-scoped `workspaceTokenAuthAPI`:

- `facebookMarketingMessages.statistics.get` —
  `GET /v1/marketing-messages/statistics`
  - input: `adAccountId` (`act_<id>`; get it from
    `facebookMarketingMessages.adAccounts.list` or from
    `campaigns.list[].adAccountId`; optional → server default per U12),
    `since`, `until` (`YYYY-MM-DD`, optional → last 30 days),
    `search` (optional, matches campaign id or name), `page`, `perPage`,
    `sort` (`id` | `name`, asc/desc).
  - output: `{ adAccountId, currency, timezone, since, until,
    rows: [{ id, campaignId, name, pageId, pageName?, delivered,
    readRate, linkClicks, linkClickRate, costPerClick, costPerDelivery,
    spend }], aggregate: { same metrics }, pagination: { page, perPage,
    total } }`. Metrics are `number | null`; rates are percentages as Meta
    returns them (e.g. `24.766355`).
  - `summary`/`description` must state where each input id comes from.
- Run the `cli-mcp-docs` skill afterwards.
- A private-path procedure in `api/private.ts` calls the same function.

### UI

- `lib/tab.ts`: add `"statistics"` to `MarketingMessagesTab`,
  `parseMarketingMessagesTab` and `buildTabSearchParams`. Also clear the
  statistics-only URL keys (ad account, since, until, search) when you switch
  tabs.
- `marketing-messages-tabs.tsx` / `marketing-messages-view.tsx`: third
  trigger + content (`statistics` slot), with an icon like the mockup.
- New `components/statistics/statistics-table.tsx` (+ toolbar):
  - Toolbar: search input (debounced), ad account select (hidden if only
    one account — builder's call), date range picker with presets plus a
    timezone hint. There are date-range components in
    `packages/ui/src/components/data-table/data-table-date-filter.tsx` and
    `features/booking-webview/components/date-range-picker.tsx`. Reuse one
    of them, don't add a new one.
  - Table: ID and Name pinned/sticky on the left (as in the mockup),
    horizontal scroll for metrics, sticky footer row. Only ID and Name have
    sort controls.
  - Footer: "Total: N campaigns" (N = rows on this page) + per-column value
    with a `Total` or `Average` caption (Total: delivered, link clicks,
    spend; Average: read rate, link click rate, cost per click, cost per
    delivery).
  - Formatting: counts as integers; rates as percentages (the mockup shows
    Meta's raw precision, e.g. `24.766355%`, which reads badly — rounding is
    the builder's call, suggested 2 decimals); money with the account
    currency in the user's locale.
  - Expired grant (U10): the view already renders the expired `GrantPanel`
    above the tabs; the Statistics tab shows an empty state and makes no
    query.
  - Loading: skeleton rows; Meta error: inline error state using the
    existing translated error mapping (`lib/error-labels.ts`,
    `withMmDeliveryErrors` pattern).
- All strings via `useTranslations()` under
  `facebookMarketingMessages.statistics.*` in `apps/builder/messages/*.json`.

## Constraints

- AGENTS.md invariants: 9 (no `db` in app layer), 20 (`logger` `err` key),
  21 (TanStack invalidation — read-only here, but the query key must include
  every filter), 23 (public API first), 7 (i18n).
- No dynamic `import()` in `integrations/facebook-ads` (tsdown).
- Graph version: use `grant.version`, as the campaign operations do.
- Meta rate limits: at most two Graph insights calls per uncached page view.

## Calls made by Claude (not confirmed by the user — check these)

| # | Call |
|---|------|
| C1 | The **ID column is Meta's `campaignId`** (the 18-digit ids in the mockup), so users can match Ads Manager. ID search = exact match on `campaignId`; ID sort sorts `campaignId`. The API row still also returns our `id` (needed for `campaigns.get`). |
| C2 | **Every campaign row appears regardless of `status`** (scheduled, notSent, failed, completed …) and regardless of when it was created relative to the date range. No delivery in range → `-` (follows U1). Deleting a campaign removes our row, so deleted campaigns never appear. |
| C3 | The `campaign.id IN` / aggregate check is the **first plan task**: a real Graph call against an ad account with sent campaigns. The UI and public API depend on it. If the unlevelled aggregate does not work, stop and ask the user (U4). |
| C4 | If Meta returns no aggregate row (no campaign on the page had data), every footer metric shows `-`. |
| C5 | If the rows call succeeds but the aggregate call fails, the response is a **partial success**: `aggregate: null` plus an inline footer error, and the rows still render. If the rows call fails, the whole query fails. |
| C6 | **Timezone source:** the ad account's `timezone_name` from Meta when this grant can see the account; otherwise the `timezoneName` stored on that account's newest campaign row; otherwise UTC. Accounts the grant can no longer see are labelled by their raw `act_<id>` and are still eligible as the U12 default. |

## Left to the builder

- Exact cache TTL (5–15 min) and key shape.
- Page size default (match the Campaign table's `useDataTable` default).
- Rate rounding and money formatting details.
- Whether the ad-account select hides when there's only one account.
- Whether the Facebook Page column shows the page name (resolved the same way
  the Campaign table does, `use-marketing-messages-name-lookups.ts`) or the
  raw id. Name preferred if the lookup is already available.
- Test layout per `testing-workflow` skill (integration-level tests for the
  insights parser incl. missing fields → `null`; operation tests for merge +
  default range; public API test).
