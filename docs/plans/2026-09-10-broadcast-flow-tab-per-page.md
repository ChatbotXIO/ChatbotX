# Plan: Flow tab per-page (each integration/page picks 1 flow) — mirror the template tab

Branch feat/broadcast-multi-page-targets (feature NOT yet in production; project IS). Scope: ONLY the FLOW sub-tab (templateType="flow") of the template-capable broadcast subactions (Messenger + WhatsApp). Template sub-tab, legacy single-page, and non-template subactions unchanged.

## Confirmed decisions
- Q1: per-page independent card; each selected page picks 1 flow. Remove the "source flow + auto-match + structural grouping + missing" model.
- Q2: each page's picker offers ONLY flows whose START TEMPLATE belongs to that page (a flow is page-bound via its template start-step) — safe, mirrors the template tab's per-page options.
- Q3: a page with no flow is allowed and SKIPPED (relax "every page needs a flow"); receiver count counts only pages with a flow.
- Q4: card = page name + a single flow picker. No preview/params (the flow already carries its template + params internally).

## Key facts (verified)
- Data model already supports it: `broadcastTargetSchema.flowId` per page; worker resolves `resolveBroadcastFlowSend(broadcast, inboxId)` per contact. NO schema/worker change.
- A flow's page = `findFlowStartTemplateId(flow, stepType)` → `templatesById.get(id)?.inboxId` (existing helpers in broadcast-flow-targets.ts + use-broadcast-page-templates).
- `stepType` per channel already an object map: `templateStepTypeByChannel` (whatsapp→sendWaTemplateMessage, messenger→sendMessengerTemplateMessage). Channel-agnostic; extend the map to add a channel.
- Parent form already syncs `targets` ↔ `inboxIds` via `syncTargetsWithInboxIds` under `isTemplateSubaction` (true for the flow sub-tab too), preserving each target's flowId on reselect.
- `dropUndeliverableTargets` (scheduleDraft) already drops targets with neither templateId nor flowId — so flow-empty pages are pruned at schedule generically. NO change needed there.
- All-empty flow send WITHOUT any legacy flowId is blocked by the generic "Either flow or template must be selected" rule. BUT a legacy top-level `Broadcast.flowId` + all-empty targets passes `broadcastSendsFlow` — today `hasBroadcastTargetWithoutFlow` rejects it; after removing that rule a NEW predicate must cover it (see D2). (Codex-confirmed edge.)
- Server already enforces flow page-binding: `listOwnedTargetFlows` (service.ts:1217) requires every target flow's start-template to belong to that target's inbox; it does NOT filter by APPROVED. The UI picker must MIRROR exactly — page-bound, no approved filter — so UI == server rule.

## Changes

### A. UI — rewrite `components/broadcast-flow-targets.tsx`
- Remove: sourceFlowId picker, `resolvePageFlows`/`bucketPageFlows` usage, `FlowTargetStatusSummary`, `FlowTargetGroupCard`, the sourceFlowId-derivation effect, the resolved→targets sync effect.
- New: read `inboxIds` + inboxes → one card per page. Card = page name (title) + a `ComboboxField name={`targets.${i}.flowId`}` whose options are that page's flows.
- Add a small presentational `BroadcastFlowTargetCard` (mirrors the simplicity; NOT BroadcastTargetCard which is template-specific). Keep it channel-agnostic — the only channel input is `stepType` from the existing map.
- CRITICAL (Codex): bind each card's flow field by resolving `fieldIndex = targets.findIndex(t => t.inboxId === page.inboxId)`, render `null` when `< 0`, and `key={page.inboxId}` — EXACTLY like the template tab (broadcast-template-targets.tsx:49). Do NOT bind `targets.${i}` by the page-map index: during add/remove `targets` is briefly stale until the parent sync effect runs, so an index-bound field can miswrite another page's flowId.
- Picker label: reuse an existing flow field label (e.g. `fields.flowId.label`); do NOT invent a key.
- Empty page → card with just the picker (no flow chosen) → skipped at send/count.

### B. Per-page flow options helper — `lib/broadcast-flow-targets.ts`
- Add `buildTargetFlowOptions({ flows, page, templatesById, stepType })`: flows whose start template's inboxId === page.inboxId → `{ label: flow.name, value: flow.id }`. Reuse `findFlowStartTemplateId`. This MIRRORS the server rule at service.ts:1217 exactly — page-bound, NO approved filter (unlike the template picker which filters approved). `templatesById` is the full store list (use-broadcast-page-templates does not filter status), matching the server.
- Remove the now-dead source-flow matching: `resolvePageFlows`, `ResolvedPageFlow`, `bucketPageFlows`, `FlowTargetGroup`, `FlowTargetBuckets`, `ResolvedPageFlowMember`. KEEP `findFlowStartTemplateId`, `FlowForTargets`. Keep the imported types `BroadcastPage`/`PageTemplateSummary`.

### C. Receiver count — `lib/broadcast-targets.ts` `resolveAudienceInboxIds`
- Make it symmetric: for a template subaction, filter targets by `templateId` when sendsTemplate, else by `flowId` (flow send). (Currently a flow send returns ALL inboxIds.) So an unconfigured page is excluded from count + preview for flow sends too. Only caller is the create/edit form; non-template subactions still get `undefined` (unchanged).
- Update its unit tests (the "flow send keeps all pages" case becomes "flow send counts only pages with a flow").

### C2. CRITICAL — fix the persistence normalizer to prune empty FLOW targets (`service.ts` `resolveBroadcastTargetsToPersist`)
- TODAY it early-returns for ANY flow send: `dropsEmptyTargets = targets.length > 0 && !(broadcastSendsFlow(data) || data.saveAsDraft)`. This was safe only because flow sends required every page to have a flow. After D relaxes that, a DIRECTLY-scheduled `create({saveAsDraft:false})` flow broadcast with page A(flow)+B(empty) would persist BOTH → prepareBroadcast enrols B → worker marks B's contacts FAILED (not skipped). (Codex-confirmed; a latent bug the flow feature activates.)
- FIX: drop the `broadcastSendsFlow(data)` term → `const dropsEmptyTargets = targets.length > 0 && !data.saveAsDraft`. The existing filter `t.templateId || t.flowId` already keeps flow targets and drops only truly-empty ones; the zero-ready throw stays. Now symmetric for template AND flow.
- Make the zero-ready throw message neutral ("Select a template or flow for at least one page") since it can now fire for a flow send — apply it in BOTH `resolveBroadcastTargetsToPersist` AND the schedule-time guard `dropUndeliverableTargets` (service.ts:601), because a flow DRAFT scheduled reaches the latter (Codex).
- Update the EXISTING test that asserts a flow send passes through unchanged → it must now assert empty flow pages are pruned (and a partial flow set keeps only the flow page). Add: direct-scheduled `create` flow partial + zero-ready.

### D1. Validation — relax the per-page flow rule
- `schema/action.ts`: remove the `hasBroadcastTargetWithoutFlow` refine + import.
- `service.ts` `assertDraftPayload`: remove the `hasBroadcastTargetWithoutFlow` rule.
- KEEP the generic "either flow or template", `hasFlowAndTemplate`, `hasDuplicateBroadcastTarget`, `isTemplateSendWithoutPage`, and the template `isTargetsTemplateSendWithoutTemplate`.

### D2. Validation — ADD `isTargetsFlowSendWithoutFlow` (mirror of the template predicate) — REQUIRED (Codex)
- New predicate in `partials/broadcast.ts`: `usesBroadcastTargets(b) && !broadcastSendsTemplate(b) && !(b.targets ?? []).some(t => t.flowId)`. Catches the legacy top-level `Broadcast.flowId` + all-empty-targets edge that `broadcastSendsFlow` alone misses.
- Wire into BOTH `schema/action.ts` (client refine) and `service.ts assertDraftPayload` (server rule), message e.g. "Select a flow for at least one page", path `targets`.
- + db partial truth-table test (legacy flowId + empty targets → true; one target has flowId → false; template send → false).

### E. Form wiring — `create-broadcast-form.tsx`
- Remove `setValue("sourceFlowId", undefined)` in the flow/template toggle (field removed). Keep `clearTargetFlows`/`clearTargetTemplates` behavior.
- No other change (targets sync + audienceInboxIds already handle flow via the helpers).

### F. Schema field + dead code + i18n
- `schema/action.ts`: remove the form-only `sourceFlowId` field.
- Remove dead flow-tab i18n keys after the rewrite IF zero refs: `broadcasts.targets.{flow, selectFlowHint, missingFlow, ready, missing, groupPages}` across all 20 locales (grep each first; some may already be shared-only-with-the-old-flow-tab). Keep any still used.
- Delete/rewrite tests: `lib/__tests__/broadcast-flow-targets.test.ts` (rewrite to test `buildTargetFlowOptions`), `apps/builder/__tests__/broadcast-flow-targets.test.tsx` (rewrite for per-page cards: one card per page, picking a flow on page A doesn't touch B, empty page allowed+excluded from count, page-scoped options only show that page's flows, deselect drops card), update `resolveAudienceInboxIds` tests, update any flow-validation test asserting the removed rule.

## Explicitly NOT changing
- Worker send/prepare (flow resolution already per-page); DB schema/migrations; legacy single-page flow; the TEMPLATE sub-tab; `dropUndeliverableTargets` (already generic — prunes flow empties at schedule); `use-broadcast-page-templates` hook; `BroadcastTargetCard`.
- PRESERVE the server ownership/page-binding test for `listOwnedTargetFlows` (service.ts:1217): the UI picker restriction is a usability mirror, NOT the authorization boundary.

## Risks
1. Per-page flow options mirror the SERVER page-binding rule (service.ts:1217) — page-bound via start-template, NO approved filter. `useBroadcastPageTemplates` returns the FULL store list (not approved-filtered), so UI == server. A legacy single-page flow that starts with a non-template node is already invalid for targets-mode (server rejects), so its absence from every picker is an intentional target-mode constraint, not a new exclusion — document it.
2. `resolveAudienceInboxIds` behavior change for flow sends (now filters by flowId). Shipping together with the UI; update tests.
3. Removing `hasBroadcastTargetWithoutFlow` must not let an all-empty flow send through — covered by the generic rule (verify with a test).
4. Ensure the flow sub-tab's targets stay synced (parent effect gated on `isTemplateSubaction`, which is true here) — verify a newly selected page gets a card.
5. Edit-draft: a reopened flow draft must show each page's saved flow (targets carry flowId; no sourceFlowId needed). Verify with a test.

## Implementation order
1. C2: fix `resolveBroadcastTargetsToPersist` to prune flow empties (+ update/extend business tests). D2: add `isTargetsFlowSendWithoutFlow` (+ db test).
2. D1: relax per-page flow rule (client + server).
3. C: `resolveAudienceInboxIds` symmetric flow filter (+ tests).
4. lib: `buildTargetFlowOptions` + trim source-flow matching (+ unit test).
5. UI rewrite of the flow tab + `BroadcastFlowTargetCard`; remove sourceFlowId field + toggle line; dead i18n; rewrite component/lib tests.
6. Full gate: lint, check-types (4 pkgs), vitest broadcast (3 layers), next build; Codex + Fable review to APPROVE.

## Added test coverage (Codex)
- db: `isTargetsFlowSendWithoutFlow` truth table.
- business: `resolveBroadcastTargetsToPersist` flow partial-prune + zero-ready; direct-scheduled `create` flow; `scheduleDraft` mixed flow/empty + all-empty flow.
- builder schema: stale top-level `flowId` + all-empty targets rejected.
- builder UI: per-page cards, page-scoped options (only that page's flows), empty page allowed+excluded from count, deselect drops card, edit-draft shows each saved flow.
- KEEP the server ownership/page-binding test.

## Existing tests that MUST change (Codex — exact, do NOT blind-fix)
- packages/business/src/broadcast/__tests__/broadcast-targets.test.ts:239 — flow partial target now PRUNES (was: passed through).
- packages/business/src/broadcast/__tests__/broadcast-targets.test.ts:885 — removed flow-completeness rule: update now SUCCEEDS and persists only ready targets.
- packages/business/src/broadcast/__tests__/broadcast-targets.test.ts:255 — normalizer zero-ready message → NEUTRAL.
- packages/business/__tests__/broadcast-service-drafts.test.ts:219 & :240 — scheduleDraft zero-ready message → NEUTRAL (after the dropUndeliverableTargets message fix).
- apps/builder/src/features/broadcasts/lib/__tests__/broadcast-targets.test.ts:120 — flow audience case → only configured pages (was: all pages).
- KEEP template-specific message at broadcast-targets.test.ts:819/:911 and create-broadcast-request-draft.test.ts:96 — those assert the TEMPLATE predicate ("Select a template for at least one page"); they must stay template-specific, NOT be made neutral.

## Verification gate
pnpm lint; check-types 4 pkgs; vitest broadcast (business/builder/worker); `next build --experimental-build-mode=compile`; Codex + Fable review.

---

## Implementation status: DONE (2026-09-10)

Implemented + verified. Notable fixes found in review (Codex, 2 code-review rounds after 3 plan rounds):
- C2 latent bug: `resolveBroadcastTargetsToPersist` now prunes empty FLOW targets too (was skipped for flow sends) — a directly-scheduled flow broadcast no longer enrols+fails an unconfigured page.
- Added `isTargetsFlowSendWithoutFlow`; neutral zero-ready message in both normalizer and `dropUndeliverableTargets`.
- Flow picker mirrors the server page-binding rule (`listOwnedTargetFlows`), and (P2#1) uses only the published `isLatest` version — a draft-only flow is offered nowhere, matching the server.
- (P2#2) legacy single-page flow drafts now carry `draft.flowId` onto their one target so they hydrate and can be saved.
- (P3) removed the now-dead `hasBroadcastTargetWithoutFlow`.

Verification: check-types (4 pkgs) · lint + i18n (20 locales) · vitest broadcast (business/builder/worker/db) · `next build --experimental-build-mode=compile` · Codex APPROVE · (Fable CLEAN; Codex caught the deeper P2/P3 that Fable missed).
