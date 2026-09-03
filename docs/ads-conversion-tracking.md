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

Two independent producers write the same `AdsConversionEvent` table:

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

There is no customer-facing Trigger or Flow-step action that records an
`AdsConversionEvent` today — the rule engine (the hidden config page) is the
only way to configure `source: "rule"` events. (A pair of Trigger automation
actions, `trackAdsLead`/`trackAdsPurchase`, previously bridged this gap by
calling into the same plumbing from `apps/worker/src/trigger/services/action-executor.ts`;
they were removed as unused. `sendMetaCapiEvent` — see below — remains
available and is unaffected.)

The rule engine:

- **Attribution gate**: no `ctwaClid` (WhatsApp) or ad-referral (`adId` +
  `source: "ADS"`, Messenger/Instagram) on the contact inbox → silent no-op. This is
  the single mechanism that keeps organic conversations out of the funnel.
- **Dedup**: `insertIgnoreDuplicate` on a deterministic `sourceEventId`, one
  conversion per event type per contact-inbox per **UTC day**.
- **Delivery**: every insert enqueues the existing `sendConversionEvent` worker job
  (`apps/worker/src/integration/handlers/ads-conversion/send-conversion-event.ts`),
  keyed by the deterministic `ads-conversion-send-{eventId}` job id so retries are
  idempotent. If the insert lands but the enqueue fails, the caller's find-or-create
  recovery path (`findBySourceEventId`) re-enqueues any row still `pending`.

## Separate from the `sendMetaCapiEvent` / `MetaCapiEvent` pipeline

The flow step and Trigger action `sendMetaCapiEvent` — sharing one field
schema, `metaCapiEventFieldsSchema`
(`packages/flow-config/src/steps/send-meta-capi-event.ts`) — and the
`MetaCapiEvent` table (`packages/database/src/schema/meta-capi-event.ts`) are a
**different, unconditional** pipeline: it sends a configurable CAPI event to
Meta with no ad-attribution gate, and never writes `AdsConversionEvent`.
Trigger/flow workspaces that only use `sendMetaCapiEvent` see nothing on the
Ads dashboard funnel. The two pipelines share no tables or dedup state and are
intentionally kept apart; do not merge them.

### What the step/action sends

| Field | CAPI parameter | Notes |
|-------|-----------------|-------|
| `eventName` | `event_name` | Defaults to `LeadSubmitted`; which names are valid depends on `actionSource` (see below). |
| `actionSource` | `action_source` | Defaults to `business_messaging`; one of `business_messaging`, `email`, `phone_call`, `chat`, `physical_store`, `system_generated`, `other`. |
| `value` / `currency` | `custom_data.value` / `custom_data.currency` | Required for `Purchase`, optional for every other event; both accept a `{{variable}}` template. |
| `contentType` | `custom_data.content_type` | `product` or `product_group`. |
| `contentIds` | `custom_data.content_ids` | Comma-separated in the field, split into an array at the business boundary (`splitContentIds`); accepts a `{{variable}}` template. |
| `contentCategory` / `contentName` | `custom_data.content_category` / `custom_data.content_name` | Free text, up to 200 characters. |
| Contact identity | channel identity or `user_data` | See action-source paragraph below. |

`eventName` is validated against one of two catalogs
(`packages/utils/src/meta-capi.ts`): `business_messaging` only offers its 14
documented Business Messaging events (`metaCapiBusinessMessagingEventNames`,
e.g. `LeadSubmitted`, `Purchase`, `QualifiedLead`) and no custom names; every
other action source offers the 17 Meta Pixel standard events
(`metaPixelStandardEventNames`, e.g. `Lead`, `Purchase`, `Contact`) plus a
custom name up to 50 characters — a custom name can never reuse a
business-messaging event name, since that name is reserved for the other
catalog.

`business_messaging` is the default action source and identifies the contact
by their per-channel messaging id — Messenger page-scoped id, Instagram IGSID,
or WhatsApp `wa_id` plus `ctwa_clid`
(`apps/worker/src/integration/handlers/meta-conversions/send-meta-capi-event.ts`).
The WhatsApp `ctwa_clid` gate (`skipped_no_identity`) only applies to this
action source. Picking any other action source sends a non-messaging
conversion: it loses Meta's click-to-message ad attribution entirely and
identifies the person only via hashed customer information (`em`/`ph`/`fn`/`ln`/
`external_id`, produced by `packages/business/src/meta-conversions/hash-user-data.ts`).
`website` and `app` are intentionally not offered as action sources — Meta
requires `event_source_url` + `client_user_agent` for website events and
`app_data` for app events, none of which a messaging-driven flow/trigger step
can supply.

### Dedup, invalid templates, and Test events

- **Dedup / `event_id`**: `metaConversionsService.buildSourceKey` is the
  `MetaCapiEvent.sourceKey` and is sent to Meta as `event_id`. Only WhatsApp
  `business_messaging` events dedup per contact per UTC day (Meta caps CAPI at
  one event per click-to-WhatsApp ad); every other channel / action source gets
  a unique id per fire, so two Purchases on the same day are two conversions.
- **Invalid resolved templates**: a `{{variable}}` that resolves to something
  the business schema rejects (e.g. `value` → `"250abc"`) is recorded in the
  workspace **Error Log** (provider `meta-conversions`, with the resolved
  values) and the flow step takes its error branch. This is the user's
  configuration problem, so it is surfaced next to Meta-side send failures
  rather than only in worker logs.
- **Test events**: each channel's CAPI tab has a *Test events* card. Saving a
  Meta `test_event_code` (Events Manager → Test events) stores it on the
  integration row (`capiTestEventCode`); while set, the worker sends it with
  every event of that integration, so Meta shows the full payload under Test
  events and does not count the events in reporting. *Send test event* queues
  one sample `Purchase` (100 USD) through the real pipeline as
  `MetaCapiEvent.source = "manualTest"`, attributed to the inbox's most recent
  contact. Both the business layer and the worker refuse to send a
  `manualTest` event without a saved code, so a test can never become a
  production conversion. Meta's Test events view lists only `_eventName` and
  `_valueToSum`; `content_*` parameters show up under *Sampled activities*.

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
