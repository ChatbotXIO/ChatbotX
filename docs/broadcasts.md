# Broadcasts — multi-page template and flow sends

A WhatsApp or Messenger **template broadcast** can send from several pages
(inboxes) at once. Each selected page carries its **own** template and params,
because Meta templates belong to a single page / WABA: a template picked for
page A can never be delivered from page B.

## Data model

| Table | Role |
|-------|------|
| `Broadcast` | The campaign row. `targetMode` says which layout is authoritative: `channel` (legacy — the single-page columns `integrationWhatsappId`, `integrationMessengerId`, `templateId`, `templateData`, else the whole channel) or `targets` (the `BroadcastTarget` rows; every legacy column is `NULL`). |
| `BroadcastTarget` | One row per page: `(broadcastId, inboxId)` PK, `flowId` (FK `Flow`, set null on delete), `templateId`, `templateData` (params + `buttons`, same shape as `Broadcast.templateData`). A page sends either its flow or its template — never both, and every page of one broadcast sends the same kind. |
| `MessengerMessageTemplate` | Gains `clonedFromTemplateId` (self FK, unique per page) and `rejectionReason`. A cross-page clone writes a `PENDING` reservation row with the parent link **before** calling Meta, so a concurrent clone of the same template onto the same page is refused by the database; the Meta response is stored immediately whatever its status. |

`targetMode` is persisted on purpose: `BroadcastTarget` rows cascade away with
their inbox, so a targets-mode broadcast whose pages were all deleted must
resolve to **nobody** — never to "every page of the channel".

The shared helpers in `packages/database/src/partials/broadcast.ts` are the
single place that knows about both layouts:

- `usesBroadcastTargets(rowOrPayload)` — `targetMode === "targets"` on a
  stored row, or a payload that carries pages.
- `resolveBroadcastTargetInboxIds(row)` — the audience inbox ids (`[]` in
  targets mode once every page is gone; `undefined` in channel mode so the
  legacy resolution applies).
- `isTemplateSendWithoutPage(payload)` — a template send naming no page at
  all (rejected at validation time).
- `hasFlowAndTemplate(payload)` — a flow and a template in one payload; the
  two layouts are mutually exclusive and such a payload is rejected.

- `broadcastSendsTemplate(row)` — does any recipient get a template?
- `resolveBroadcastTemplateSend(row, inboxId)` — the template (+ params) a
  contact on `inboxId` receives: the target row for that inbox, else the
  legacy columns when the broadcast has no targets, else `null`.
- `hasBroadcastTargetWithoutTemplate(row)` — a template send with a page that
  has no template (rejected at validation time).
- `isTemplateBroadcastSubaction(subaction)` — the subactions that use the
  per-page picker.

Never read `Broadcast.templateId` / `templateData` directly on a send or
display path; go through these helpers so legacy and multi-page rows keep
behaving the same.

## Why a flow per page

A flow's template start step is bound to one page's template
(`packages/flow-config/src/steps/template-start-step.ts` →
`findTemplateStartStep`), so one flow can only run on one page. A multi-page
flow broadcast therefore stores the flow chosen for each page; the service
checks (in one batch) that each flow belongs to the workspace and that its
start template lives on that page.

## Structural grouping in the form

The form never shows one card per page. The user picks a template by
**name + language** (options are one per pair across the selected pages,
with the count of pages holding an approved copy — `buildTemplateSelectionOptions`).
Every page then resolves its own copy, and pages are grouped by
`templateStructureKey` (`packages/flow-config/src/template-structure.ts`): the
send-relevant structure — component types/formats/text, button order and
kinds, dynamic URL/payload flags, WhatsApp FLOW `flow_id`/`navigate_screen`,
carousel cards, LTO — with page-specific `example` data left out.

- same structure → one card; the leader page holds the params and the other
  members mirror them on every change (`mirrorGroupValues`, cloned values);
- different structure → its own card;
- "Configure separately" detaches a page into its own card
  (`detachedInboxIds`, form-only); regrouping never overwrites a detached page;
- no template / pending / rejected pages are listed with their status; Messenger
  offers "Clone template to N missing pages" and "Check status again"
  (`cloneMessengerMessageTemplateAction`, `recheckMessengerTemplateClonesAction`);
  WhatsApp templates are WABA-reviewed and only matched, never created inline;
- Confirm stays disabled while any page is not approved-ready (server rule:
  "Template is not approved").

The flow tab works the same way with a source flow: every page gets the flow
whose start template is that page's copy with the same structure
(`resolvePageFlows`), ties are broken by the source flow's name, ambiguity
leaves the page missing.

A reopened draft derives the selection from the saved targets and treats a
page whose saved params differ from its group as detached
(`inferDetachedInboxIds`); reopening never mutates `targets`.

## Messenger clone pipeline (`actions/clone-message-templates.ts`)

Per target page, in order: reuse the row already cloned from the source
(`clonedFromTemplateId`), else the row with the same name + language, else
resync the page by name from Meta and look again. `APPROVED` → reuse and link;
`PENDING` with a Meta id → resync by name and report the refreshed status (a
`clone:*` reservation is another clone in flight and is reported pending as
is); `REJECTED` → report `rejectionReason`. Nothing found → `reserveClone`
(unique per page + source) → upload image headers → Meta create →
`fulfillReservation` with the response (any status). A failed create — or a
fulfil whose reservation is gone — discards the reservation and re-reads the
page by name (Meta refusing a duplicate name means the template already exists
there). Batches of 5, at most 25 pages per call, source must be `APPROVED`,
targets come from `listCloneTargetsForUser({ authoritative: true })`.

A full sync (`deleteMissingForIntegration`) removes rows Meta no longer lists
but keeps `clone:*` reservations younger than `CLONE_RESERVATION_TTL_MS`
(15 min), so a sync running between a reservation and Meta's answer cannot let
a second clone create the template again; older reservations are orphans of a
crashed clone and are swept so the pair can be retried. Stored `components` are
narrowed at the Meta boundary (`MetaTemplateComponent`, no `any`).

The flow tab groups pages the same way (`bucketPageFlows`): one card per start
template structure listing each page with the flow it will run, plus the
pages with no matching flow.

## Write path

`createBroadcastAction` and `broadcastService.updateDraft` both take the
`targets[]` payload (`inboxId`, `templateId`, `templateData`, `buttons`).

1. `broadcastService.assertBroadcastTargetsOwned` — every target inbox must
   belong to the workspace **and** the broadcast's channel (one batched query);
   the legacy integration ids are still checked as before. A template send must
   name a page: targets, or (legacy) the matching integration id.
2. `broadcastTemplateSelections(data)` turns the payload into one selection per
   page (or the legacy single template scoped by its integration ids).
   `resolveTemplateBroadcastName` loads all selected templates in one query and
   pairs each back with its page — a template that lives on another page
   yields `null`, which the callers surface as "Template not found".
3. The auto name is `"{page} - {template}"` per target, joined with `" / "`
   and truncated to 255 characters.
4. `broadcastService.create` / `updateDraft` write the `Broadcast` row and
   replace its `BroadcastTarget` rows inside one transaction.
   `copyTargets` does the same for a resend.

## Send path (worker)

- `prepareBroadcast` passes `resolveBroadcastTargetInboxIds(broadcast)` to the
  audience query. `inboxService.resolveBroadcastInboxIds` is an ordered
  strategy list: explicit `inboxIds` whenever given (workspace + channel
  scoped; an empty list is a real "nobody") → legacy WhatsApp integration →
  legacy Messenger integration → channel list.
- `processBroadcastContacts` resolves the template for each recipient with
  `resolveBroadcastTemplateSend(broadcast, contactInbox.inboxId)`. A recipient
  whose page has no template is marked failed with
  `no template selected for the contact's page`; the broadcast keeps going.
- The chat send handlers are unchanged: their existing "template belongs to
  the inbox's integration" validation is now a second safety net.
- WhatsApp Flow button responses (`template-flow-response.ts`) read the params
  of the responding contact's page through `findByIdForResponse({ inboxId })`.

## Builder

- `create-broadcast-form.tsx` shows a page multi-select
  (`BroadcastInboxMultiSelect`, options from the inbox store filtered by
  channel) and, for template subactions, `BroadcastTemplateTargets` /
  `BroadcastFlowTargets`: one `BroadcastTargetCard` per **structural group**
  (params entered once on the group's leader page and mirrored to its
  members), with a detached page getting its own card. The card is
  channel-agnostic; per-channel template pickers are registered in
  `targetTemplateFieldsByChannel`.
- `lib/broadcast-targets.ts` holds the pure form helpers (sync targets with
  the selection, clear templates when switching to a flow, build
  `"{page} - {template} (lang)"` options).
- A legacy single-page draft is reopened as one target on its integration's
  inbox (`buildEditBroadcastDefaultValues`) and stored as a target on its next
  save.
- The detail dialog lists every page with the template and preview it sends
  (`privateListBroadcastTemplateDetailsAPI`).
