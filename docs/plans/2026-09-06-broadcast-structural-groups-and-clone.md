# Plan v4: structure-grouped multi-page template broadcasts + idempotent Messenger clone

## Product model (replaces the "shared vs per-page" toggle)
Cards are STRUCTURAL GROUPS, not pages. Flow:
1. User picks pages (multi-select) and, on a source page, a template (name+language) — or a flow.
2. For every selected page the system resolves that page's template with the same (name, language). Pages are then grouped by a structural fingerprint of the template:
   - identical structure -> one group -> ONE card (template params/buttons entered once, applied to all pages in the group);
   - different structure -> separate group -> its own card;
   - page has no such template -> "missing" bucket: Messenger shows "Clone to N pages" (idempotent clone below), WhatsApp shows the page as missing (deselect or pick another template);
   - page template exists but not APPROVED -> "pending/rejected" bucket; never sendable.
3. Optional per-page detach ("Tách riêng page này") moves one page into its own group with its own params (drawer with the existing card). Not required for v1 but the data model supports it (targets are still one row per page).
4. Persisted payload is unchanged: `targets[]` = one row per page with its own templateId + templateData. Groups exist only in the form.

## Structural fingerprint (pure helper, tested)
`templateStructureFingerprint(template)` = canonical JSON of:
- category, parameterFormat (Messenger), language, name;
- components mapped to: { type, format, text, buttons: [{ type, text, url, phone_number, hasDynamicPayload: payload includes "{{" }], cards: [{ card_index, components: same mapping }], limited_time_offer: { has_expiration } }.
- EXCLUDED: `example` (page-specific header_handle uploads and sample values), Meta ids, status, timestamps.
Rationale: extractTemplateParams / extractMessengerTemplateParams read only text placeholders, header format, button type/url/payload, cards, LTO — so equal fingerprint <=> identical param layout AND identical rendered content. Key order canonicalised.
Grouping: pages with equal fingerprint share a group; group key = fingerprint hash.

## Messenger idempotent clone (business service `messengerTemplateCloneService`)
- Schema: `MessengerMessageTemplate.clonedFromTemplateId` (self FK set null) + unique (integrationMessengerId, clonedFromTemplateId) where not null; `rejectionReason`; sync requests `rejection_reason` from Meta and stores it.
- Source must be APPROVED (server-side). Targets = authoritative admin pages minus source pageId (existing listCloneTargetsForUser, authoritative).
- Per target: local lookup by clonedFromTemplateId, else by (name, language); if none, resync that page by name from Meta and look again; still none -> upload headers, POST create, then UPSERT the returned entity immediately (id/status/components/parent link) — status APPROVED/PENDING/REJECTED all stored. Meta duplicate-name error -> resync by name and reuse. PENDING -> resync only; REJECTED -> return reason, do not recreate.
- Batches of 5, cap 25 targets per call (after auth + dedup). Result keeps `{ succeeded, failed }` for the existing dialog and adds per-target `status`.
- `recheckMessengerTemplateClonesAction` resyncs pending pages by name/language.
- After clone, the broadcast form refetches templates (all statuses for the selected pages) and regroups.

## Server rules (broadcastService)
- Every target template must be APPROVED -> field error "Template is not approved".
- `BroadcastTarget.flowId` (nullable FK set null): flow per page; one delivery kind per broadcast; flow must be workspace-owned and its start template must belong to the target inbox (batch checks); deleted flow -> per-contact failure.
- Worker resolves { flowId, templateId, templateData } per inbox via one helper; legacy rows unchanged; targetMode intact.

## Flow tab
Same grouping: source flow -> for each page find a flow whose start-step template resolves to that page and has the same fingerprint as the source flow's template; group by fingerprint; cards per group show the flow per page; missing pages flagged. No flow auto-clone.

## Draft reopen
Regroup stored targets by fingerprint + canonical params: pages with equal fingerprint AND equal params/buttons share a card; otherwise separate cards. Reopen never mutates targets.

## Phases
1 schema (BroadcastTarget.flowId, MessengerMessageTemplate.clonedFromTemplateId/rejectionReason, migration regenerated, not applied)
2 fingerprint + grouping helpers + tests
3 clone service + recheck action + dialog contract + tests
4 business rules (APPROVED, flow per target) + worker + tests
5 UI: page multi-select w/ search, source template picker, group cards, status buckets, clone/recheck buttons, drawer detach (optional), summary + confirm gating
6 lint, typecheck, suites, Codex rounds

## Codex plan-review amendments (accepted)
- Fingerprint lives in flow-config next to the extractors; includes button order/type/text/url(dynamic)/phone/payload-dynamic, WA FLOW flow_id + navigate_screen, COPY_CODE/CATALOG/MPM types, cards, LTO, parameterFormat, literal text; excludes `example`, ids, status, user-entered values.
- Clone: reservation row (PENDING, parent link) + unique(integrationMessengerId, clonedFromTemplateId) BEFORE the Meta POST; response upserted immediately; duplicate-name -> resync by name and reuse; result keeps { succeeded, failed } + per-target status; pending is not a failure.
- Server: APPROVED required on create + updateDraft; per-target flowId with batch ownership + start-template-on-inbox check; mixed flow/template targets rejected; worker resolves both branches per inbox; deleted flow -> per-contact failure.
- Grouped cards: identity by inboxId, fan-out writes clone values per member, detach snapshots and is never regrouped; reopen never mutates targets.

## Checklist
- [x] P1 schema + migration
- [x] P2 fingerprint + grouping helpers + tests
- [x] P3 clone service + reservation + recheck + dialog + tests
- [x] P4 business rules + worker + resend + tests
- [x] P5 UI
- [x] P6 verification + Codex (rounds 8–10; round 10 APPROVE)
