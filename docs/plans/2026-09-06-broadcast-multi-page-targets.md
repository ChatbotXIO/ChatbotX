# Implementation Plan: Template broadcasts from multiple pages (one template per page)

Approved 2026-09-06. Scope: WhatsApp / Messenger template broadcasts can target several
pages; each selected page carries its own template + params. Legacy single-page rows
(`Broadcast.integrationWhatsappId` / `integrationMessengerId` / `templateId` / `templateData`)
keep working unchanged.

## Data model

- New table `BroadcastTarget (broadcastId, inboxId, templateId?, templateData?)`,
  PK `(broadcastId, inboxId)`, FK cascade both sides, index on `inboxId`.
- `Broadcast` legacy columns stay for existing rows. New broadcasts write targets only.
- Auto name: `"{page} - {template}"` per target, joined with `" / "`, truncated to 255.

## Phases

### Phase 1 — Database
- [x] `packages/database/src/schema/broadcast-target.ts`
- [x] relations: `broadcast.targets`, `broadcastTarget.{broadcast,inbox}`, `inbox.broadcastTargets`; `relations/index.ts` import + spread
- [x] `types.ts` export `BroadcastTargetModel`
- [x] generate migration `add_broadcast_target` (do NOT apply)

### Phase 2 — Business (`packages/business`)
- [x] `inboxService.resolveBroadcastInboxIds`: ordered strategy list incl. explicit `inboxIds` (workspace + channel scoped)
- [x] `BroadcastAudienceInput.inboxIds`
- [x] `broadcastService.assertBroadcastTargetsOwned` (inbox ownership/channel + template belongs to inbox integration, batched)
- [x] `broadcastService.create` (transaction: Broadcast + BroadcastTarget)
- [x] `broadcastService.updateDraft` replaces targets in transaction
- [x] `findDraft` / `listForCalendar` load `targets` with inbox name
- [x] `resolveTemplateBroadcastName` accepts targets, naming rule
- [x] `listTemplateDetails` (array; legacy row → one element)
- [x] `isTemplateBroadcast` helper in `partials/broadcast.ts`

### Phase 3 — Worker
- [x] `prepareBroadcast` passes `inboxIds` from targets (legacy fallbacks kept)
- [x] `processBroadcastContacts` resolves per-inbox target; legacy fallback; missing → `markContactFailed`
- [x] `template-flow-response.ts`: integration from contact inbox for multi-target broadcasts (verify `applyResponse`)

### Phase 4 — Builder
- [x] `createBroadcastRequest.targets[]` (+ per-target WA send-param rules)
- [x] create page resolves Ads prefill `integrationWhatsappId` → `initialInboxIds`
- [x] `components/broadcast-inbox-multi-select.tsx`
- [x] `components/broadcast-target-card.tsx` (channel registry for params form / preview)
- [x] `lib/broadcast-targets.ts` pure helpers (sync targets with inboxIds, template options `"{page} - {name} (lang)"`, seed params)
- [x] form no longer calls `setIntegrationWhatsappId`
- [x] receivers count + audience preview pass `inboxIds`
- [x] `listFlows` accepts `integrationWhatsappIds`
- [x] edit draft hydrates targets; resend copies targets; detail dialog per-target rows
- [x] i18n keys

### Phase 5 — Tests (TDD)
- [x] business, worker, builder suites listed in the approved plan
- [x] `pnpm lint`, `check-types` for database/business/worker/builder

### Phase 6 — Docs
- [x] `docs/broadcasts.md` + link from `AGENTS.md`
