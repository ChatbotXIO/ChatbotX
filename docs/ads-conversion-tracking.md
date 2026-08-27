# Ads conversion tracking

ChatbotX attributes chatbot conversations back to the Meta ad that started them —
**CTWA** (Click to WhatsApp), **CTM** (Click to Messenger), and **CTID** (Click to
Instagram Direct) — and reports Leads/Purchases/Revenue on the Ads dashboard, with
delivery back to Meta via the Conversions API (CAPI) so ad platforms can optimize
against real chatbot outcomes.

## The model

| Concept | Where | Notes |
|---------|-------|-------|
| Attribution | `ContactInbox.referral` (`jsonb`, `packages/database/src/schema/contact-inbox.ts`) | Captured off the inbound webhook. WhatsApp carries `ctwaClid`; Messenger/Instagram carry `adId` + `source: "ADS"` (a `SHORTLINK` `source` means an organic ig.me link, never ad-attributed). Two partial indexes back the attribution lookups: `ContactInbox_referral_ctwaClid_idx` and `ContactInbox_referral_adId_idx` (the latter scoped to `source = 'ADS'`). |
| Rule | `AdsConversionRule` (`packages/database/src/schema/ads-conversion-rule.ts`) | Workspace-configured "when X happens on this integration, record a lead/purchase" — trigger kinds `templateSent`/`tagApplied`/`keywordMatched`/`contactReplied`. Configured on a deliberately hidden page (`/dashboard/ads/conversion-events`, not linked from navigation). |
| Event | `AdsConversionEvent` (`packages/database/src/schema/ads-conversion-event.ts`) | One row per recorded conversion. `source` is `automatic` (Meta's own webhook-reported event, WhatsApp only), `rule` (an `AdsConversionRule` fired), or `trigger` (a Trigger automation action fired — see below). `eventType` is `lead` or `purchase`; `capiStatus` tracks CAPI delivery (`pending`/`sent`/`failed`/`skipped_no_scope`/`skipped_region`). |

## How conversions get produced

Three independent producers write the same `AdsConversionEvent` table:

1. **Meta Automatic Events** (`source: "automatic"`, WhatsApp only) — Meta detects
   leads/purchases in the conversation itself and reports them via webhook;
   `adsConversionService.ingestAutomaticEvent`
   (`apps/worker/src/integration/handlers/ads-automatic-event.ts`) stores them
   with Meta's own event id as `sourceEventId` and, crucially, with a real order
   value. No workspace configuration beyond enabling Automatic Events on the
   WABA's Ads Optimization (CAPI) tab. Messenger/Instagram have no Meta-side
   equivalent.
2. **The rule engine**, evaluated from the hidden config page's `AdsConversionRule`
   rows — matches on template sends, tag applications, keyword matches, or contact
   replies (`adsConversionService.evaluateConversionTriggerRule` /
   `evaluateAdReferralTriggerRule`, `packages/business/src/ads-conversion/service.ts`).
3. **The Trigger automation actions `trackAdsLead` / `trackAdsPurchase`**
   (`apps/worker/src/trigger/services/action-executor.ts`) — the customer-facing way
   to configure this today, since the rule page is hidden. A Trigger with either
   action calls `adsConversionService.recordTriggerConversion`
   (`packages/business/src/ads-conversion/record-trigger-conversion.ts`), which
   reuses the exact same attribution/dedup/delivery plumbing as the rule engine.
   `trackAdsPurchase` accepts an optional **static** `value`/`currency` (no
   custom-field variables) that flows into `AdsConversionEvent.value` — real Revenue
   on the dashboard, unlike rule-produced purchases, which record $0.

The rule and trigger producers share:

- **Attribution gate**: no `ctwaClid` (WhatsApp) or ad-referral (`adId` +
  `source: "ADS"`, Messenger/Instagram) on the contact inbox → silent no-op. This is
  the single mechanism that keeps organic conversations out of the funnel.
- **Dedup**: `insertIgnoreDuplicate` on a deterministic `sourceEventId`, one
  conversion per mechanism per event type per contact-inbox per **UTC day**. For
  triggers the key is `trigger-{triggerId}-{eventType}-inbox-{contactInboxId}-{utcDay}`
  — `eventType` is part of the key specifically so a single Trigger carrying both
  actions produces two distinct events instead of the second deduping against the
  first. A workspace running both a legacy rule and a trigger for the same event
  type will double-count by design (dedup is per-mechanism, not global).
- **Delivery**: every insert enqueues the existing `sendConversionEvent` worker job
  (`apps/worker/src/integration/handlers/ads-conversion/send-conversion-event.ts`),
  keyed by the deterministic `ads-conversion-send-{eventId}` job id so retries are
  idempotent. If the insert lands but the enqueue fails, the caller's find-or-create
  recovery path (`findBySourceEventId`) re-enqueues any row still `pending`.

## Separate from the `sendMetaCapiEvent` / `MetaCapiEvent` pipeline

The Trigger action `sendMetaCapiEvent` and its `MetaCapiEvent` table are a
**different, unconditional** pipeline: it sends a manual `LeadSubmitted` CAPI signal
to Meta with no ad-attribution gate, and never writes `AdsConversionEvent`. Trigger
workspaces that only used `sendMetaCapiEvent` see nothing on the Ads dashboard funnel
— that gap is exactly what `trackAdsLead`/`trackAdsPurchase` close. The two pipelines
share no tables or dedup state and are intentionally kept apart; do not merge them.

## Where Ads dashboard metrics come from

The Ads dashboard (`apps/builder/src/features/ads/components/ads-analytics-view.tsx`)
merges two sources per request, not one:

- **Leads / Purchases / Revenue / CAPI delivery status** — read straight from the
  `AdsConversionEvent` table (all three `source` values combined; the funnel and
  export queries do not filter by `source`).
- **Spend / impressions / clicks** — fetched live from the Meta Graph API
  (`getCachedAdAccounts` / `getCachedAdInsights` / `getCachedDailyAdInsights`,
  `apps/builder/src/features/integration-facebook-ads/queries`), short-lived-cached
  to stay under Graph API rate limits, never persisted to our own tables.

`mergeAdsAnalytics` (`apps/builder/src/features/ads/lib/merge-analytics.ts`) joins
the two by ad id/date so a single dashboard row shows both "what we recorded" and
"what Meta reports," even though they come from different systems on different
freshness guarantees.
