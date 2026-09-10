# Plan v2: Redesign the multi-page TEMPLATE tab (per-page independent template)

Branch feat/broadcast-multi-page-targets (feature NOT yet in production; project IS in production).
Scope: ONLY the TEMPLATE subaction tab (Messenger + WhatsApp). FLOW tab must stay unchanged.

## Confirmed decisions
- Q1=B: each selected page = one card; template picker INSIDE the card (reuse `BroadcastTargetCard`).
- Q2: drop ALL structural grouping + params mirror + `detachedInboxIds`. Pages independent.
- Q3: remove clone + status summary from the broadcast tab (clone stays on message-templates page / PR #1123).
- Q4: a selected page with NO template is allowed and SKIPPED (no error). Receiver count counts only pages with a template.
- Q4 corollary (Codex): the broadcast as a whole must still have >=1 page with a template (drafts included). An all-empty template send has nothing to preview/send and is rejected by the EXISTING "either flow or template" refine — no new rule, and it keeps templateType inference correct on reopen (a saved template draft always carries >=1 templateId).

## Send path already correct
Worker resolves `resolveBroadcastTemplateSend(broadcast, inboxId)` per contact inbox and sends that target's own templateId (process-broadcast-contacts.ts). Different template per page already works. No send-logic change.

## Changes

### A. Template tab component — REWRITE `components/broadcast-template-targets.tsx`
- Remove selection-key combobox, resolve/bucket/group/mirror, detached, status summary, clone actions, related hydration.
- New: read `inboxIds`+inboxes → one `BroadcastTargetCard` per inbox (picker SHOWN, `templatePickerHidden={false}`), fieldName `targets.${i}`. Per-card seeding/hydration already handled by `BroadcastTargetCard` + `resolveTemplateHydration`.
- `targets` synced to `inboxIds` via existing `syncTargetsWithInboxIds`.

### B. Receiver count + preview — `create-broadcast-form.tsx`
- Change `audienceInboxIds` (create-broadcast-form.tsx:590; also feeds preview at :850) for the TEMPLATE subaction to the inboxIds of targets that HAVE a templateId (skip empty). Flow subaction unchanged. This fixes BOTH count and preview (shared value).

### C. Client schema — `schema/action.ts`
- Remove fields `templateSelectionKey`, `detachedInboxIds`.
- Remove refinement `hasBroadcastTargetWithoutTemplate` (import at :105) AND keep the FLOW refinement `hasBroadcastTargetWithoutFlow` (:109) intact.
- KEEP `hasDuplicateBroadcastTarget`, `isTemplateSendWithoutPage`, and the generic "either flow or template" refine (schema/action.ts:97) — the latter now doubles as the ">=1 template somewhere" guard for template sends, drafts included. So an all-empty template draft stays rejected exactly as today; only INDIVIDUAL empty pages become allowed.
- ADD a targeted refine (new predicate in partials/broadcast.ts, e.g. `isTargetsTemplateSendWithoutTemplate`): when `targets` are present and it is NOT a flow send, require at least one `targets[].templateId`. This closes the edge where a legacy top-level `templateId` makes `broadcastSendsTemplate` true while every target is empty (persistence clears the legacy column in targets mode -> draft reopens as flow). Wire it into BOTH schema/action.ts (client) and service.ts validation (server).
- No change to `create-broadcast-defaults.ts:250` templateType inference: with the new refine a persisted template draft always has >=1 target templateId, so it reopens on the Template tab correctly.

### D. Business persistence — `packages/business/src/broadcast/service.ts` (create :756 + updateDraft :895; both replace all target rows)
Define an explicit normalization for a TARGETS-FORM template send:
- DRAFT (saveAsDraft / status=draft): KEEP empty targets (round-trip the page selection so reopening a draft preserves unconfigured pages). targetMode stays "targets" (non-empty list).
- NON-DRAFT (scheduled/sending): FILTER targets to those with templateId.
  - If >=1 remains: persist the filtered set, targetMode "targets".
  - If 0 remains: THROW a validation error ("Select a template for at least one page"). NEVER fall back to channel mode. (Defense-in-depth: given the >=1-template refine this should not occur via the form, but the guard MUST exist so no code path — resend, legacy payload, direct call — can drop a targets-form template send to 0 targets and trigger resolveBroadcastTargetMode->"channel" + buildBroadcastColumns legacy-restore at service.ts:199,772, which would blast the whole channel audience.)
- Remove the service-side all-pages-have-template rule at service.ts:943. KEEP the flow rule at :948. KEEP the generic either-flow-or-template rule at service.ts:927, AND ADD the new server-side `isTargetsTemplateSendWithoutTemplate` guard (targets present + not flow => >=1 target templateId). Together these guarantee a targets-form template send always persists >=1 real template.
- Flow send path: unchanged (keep all-pages-have-flow).
- Verify `assertBroadcastTargetsOwned` runs on the persisted (post-filter) set.
- When a draft with empty targets is later SCHEDULED (launch boundary), the same non-draft normalization + zero-ready guard applies.

### E. Remove template-only dead code (flow tab shares some modules)
- DELETE `components/broadcast-messenger-clone-actions.tsx` (template-only, untracked) + its template-tab import.
- KEEP `hooks/use-broadcast-page-templates.ts` (flow tab imports it).
- `lib/broadcast-target-groups.ts`: KEEP the still-shared TYPES `BroadcastPage` AND `PageTemplateSummary` (both used by flow lib broadcast-flow-targets.ts:2; BroadcastPage also by broadcast-flow-targets.tsx:25). DELETE the now-unused grouping/selection/status exports (resolvePageTemplates, bucketTargetPages, TargetGroup, mirror*, selection-key*, status buckets) and prune `lib/__tests__/broadcast-target-groups.test.ts` to the surviving exports. (Alternatively relocate the two types to a small shared file; keeping them in place is lower-risk.)
- i18n: grep each `broadcasts.targets.*` key; delete only keys with zero remaining references across all 20 message files; keep keys still used by the per-page card.

### F. Tests
- Rewrite `apps/builder/__tests__/broadcast-template-targets.test.tsx` for per-page cards (each selected page renders a card; picking on A doesn't touch B; empty page allowed, no error).
- Extend `broadcast-target-card.test.tsx`: picker shown lists ONLY that page's APPROVED templates; picking seeds params.
- Business: create/updateDraft — draft keeps empty targets; non-draft drops empty; non-draft zero-ready THROWS (never channel mode); mixed ready/empty persists only ready.
- Worker/prepare: mixed ready/empty enrolls only ready pages (audience from persisted targets); no page marked failed for "no template".
- Form: count + preview exclude empty pages.
- Edit-draft round trip: a draft with page A(template)+B(empty) reopens with BOTH pages selected (B empty).
- Leave ALL flow-tab tests + validation untouched and green.

## Explicitly NOT changing
- Worker send/prepare core logic; DB schema/migrations; legacy single-page path; FLOW tab + its shared modules; clone on message-templates page.

## Implementation ORDER (Codex-recommended)
1. Business normalization: draft-keep / non-draft-filter / zero-ready guard (never channel fallback). + tests.
2. Remove the two completeness checks (zod refinement + service :943), keep flow rules.
3. Switch count/preview to targets-with-templateId.
4. Simplify the template-tab UI (rewrite component) + remove clone-actions + trim dead exports/i18n.
5. Full gate.

## Risks
- Zero-ready -> channel fallback (CRITICAL; guarded in D).
- Two-place all-pages rule (C + D).
- Shared types `BroadcastPage`/`PageTemplateSummary` needed by flow (E).
- Draft edit round-trip page loss (resolved: keep empty targets in drafts).
- i18n missing-key at runtime (grep before delete).

## Verification gate
pnpm lint; check-types builder+business+worker; vitest builder+business+worker; `next build --experimental-build-mode=compile`; Codex review until APPROVE.

---

## Implementation status: DONE (2026-09-10)

Implemented and verified. Highlights vs. the plan:
- Backend predicate `isTargetsTemplateSendWithoutTemplate` + `resolveBroadcastTargetsToPersist` normalizer wired into `create`/`updateDraft`.
- `scheduleDraft` now prunes undeliverable (template-less) target rows in its transaction via `dropUndeliverableTargets`, rejecting a targets-mode send that would reach nobody (including the inbox-cascade zero-row case) while leaving legacy channel-mode drafts untouched.
- Template tab rewritten to one independent `BroadcastTargetCard` per page (picker in-card); grouping/mirror/detach/clone/status removed.
- Audience scoping extracted to the pure, tested `resolveAudienceInboxIds` (template send counts only pages with a template; flow send keeps all pages).
- Dead code + template-only i18n keys removed; flow-tab shared types kept.

Verification: check-types (builder/business/database/worker) ✓ · lint + i18n (20 locales) ✓ · broadcast vitest (business 110, builder 140, worker 53) ✓ · `next build --experimental-build-mode=compile` ✓ · Codex review APPROVE (3 rounds, 3 HIGH issues found & fixed) · Fable review CLEAN.
