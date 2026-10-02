# Quick reply settings (Follow-up & Retry) — Design

- **Date:** 2026-09-30
- **Branch:** `feat/configure-quick-replies`
- **Status:** Approved design; revised during planning (see §9). Plan:
  `docs/superpowers/plans/2026-09-30-quick-reply-settings.md`

## 1. Goal

Let a flow author configure, once per Send Message node, what happens after the
node's quick replies are sent:

1. **Follow up if contact hasn't engaged** — after a wait (N minutes/hours/days)
   with no inbound message, route the contact to a chosen next step.
2. **Retry if reply isn't a Quick reply** — when the contact answers with
   anything other than a quick-reply tap, re-send a retry message with the same
   quick replies, up to N times; once exceeded, route to a chosen next step.

Success = an author can enable either/both from a single ⚙️ icon in the quick
replies row, pick next steps with the same picker as the button editor, see the
routing as edges on the canvas, and the worker behaves per the rules below.

## 2. Decisions (from interview)

| Topic | Decision |
|---|---|
| "Engaged" | Any inbound message from the contact (tap, text, attachment, location) cancels the follow-up — checked when the timer fires |
| Precedence vs Keywords / AI | Retry wins while pending (same as Get User Data challenge) |
| Retry send | Retry text + the node's same quick replies re-attached |
| Both on, contact sends free text | Follow-up is cancelled; only the retry loop continues |
| Next-step options | All button types except `openWebsite` (and `whatsappOptionList`) |
| Canvas | Two labelled source handles + `buttonedge` edges ("No engagement", "Retries exceeded") |
| Number of retries | 0–5, default 3. `0` = first non-QR reply goes straight to the fallback step, no retry message |
| Wait units / 24h window | minutes/hours/days, max 366 days. At fire time the channel send path skips if the window is closed; helper hint in modal |
| Cancel pending state on | contact enters a **different flow**; human handoff / paused; same node re-sent (restart) or a later quick-reply node armed (supersede); flow version published (pinned versions) |
| Toggle on without target | Blocked by validator (publish/save error) |
| Late tap on original QR | Still works as today |
| Channels | Every channel that renders quick replies |
| ⚙️ icon visibility | Only when ≥ 1 quick reply |
| Save model | Live (no footer), bound to the node form |
| Retry message | Text + variables, max 255, i18n default "Please, tap one of the options below 👇" |
| Get User Data in the same node | Retry disabled (UI + schema). Follow-up still allowed |
| Additional steps on targets | No — target only |
| Analytics | Not in v1 (structured logs only) |
| Runtime approach | **A** — reuse `conversation.additionalAttributes.challenge` for Retry and `ContactOnSmartDelay` for Follow-up |

## 3. Data model

### 3.1 `packages/flow-config`

New file `src/steps/quick-reply-settings.ts`:

```ts
// Label-less, steps-less button. No id: the handle id lives on the section.
quickReplyNextStepSchema = discriminatedUnion("buttonType", [
  sendMessage       -> beforeStep: startAnotherNodeStepSchema,
  performAction     -> beforeStep: startAnotherNodeStepSchema,
  startAnotherNode  -> beforeStep: startAnotherNodeStepSchema,
  startExternalFlow -> beforeStep: startExternalFlowStepSchema,
  startExternalNode -> beforeStep: startExternalNodeStepSchema,
])

quickReplySettingsSchema = {
  followUp: {
    id: zodBigintAsString(),             // stable canvas handle id (edge sourceHandle)
    enabled: boolean,
    duration: int >= 1,
    unit: waitStepDelayUnits.extract(["minutes", "hours", "days"]),
    target: quickReplyNextStepSchema | null,
  },
  retry: {
    id: zodBigintAsString(),             // stable canvas handle id; also the retry send's step id
    enabled: boolean,
    message: string.trim().max(255),
    maxRetries: int 0..5,
    target: quickReplyNextStepSchema | null,
  },
}
```

The section `id` is created by the default fn and never changes, so deleting an
edge (`target = null`) keeps the handle drawable.

Node-level rules (`refineQuickReplySettings`, attached with `.superRefine` on
`sendMessage.details`, skipped entirely when `quickReplies` is empty), each
raised as a `flowValidationCodes` code so the builder shows `messages.<code>`:
- `followUp.enabled` ⇒ `followUp.target` required (`quickReplyNextStepRequired`).
- `followUp.duration * unit` ≤ `FOLLOW_UP_MAX_DELAY_DAYS` (366d, reused from `follow-up.ts`).
- `retry.enabled` ⇒ `retry.target` required (`quickReplyNextStepRequired`).
- `retry.enabled && retry.maxRetries >= 1` ⇒ non-empty `retry.message` (`quickReplyRetryMessageRequired`).
- `retry.enabled` with a `getUserData` step in `steps` is rejected (`quickReplyRetryWithGetUserData`).

`quickReplySettingsDefaultFn()`: both disabled, fresh ids; follow-up `1 day`;
retry `maxRetries: 3`, `message: ""` (the builder fills the i18n default the
first time the toggle is switched on).

`sendMessageNodeSchema.details.quickReplySettings`: `.optional()` so existing
flows keep parsing. Default set in `sendMessageNodeDefaultFn`. Legacy nodes are
backfilled by the builder when the settings dialog first opens
(`upgradeNodeSteps` is a per-step-type upgrader with no per-node hook).

Runtime helpers (node JSON reaches the worker unparsed, so they tolerate legacy
nodes and string numbers):
- `resolveActiveQuickReplySettings(details)` → the enabled sections that have a
  target (retry dropped when the node has `getUserData`; `{}` when there are no
  quick replies or no settings).
- `listQuickReplySettingsHandles(details)` → handles the canvas draws: enabled
  sections whose target is empty or a node jump.
- `quickReplyNextStepFollowsEdge(target)`, `computeQuickReplyFollowUpTriggerAt(section)`.

`routable-handle.ts` gains a `quickReplySettings` accessor so canvas
connect/delete (`applyRouteUpdatesInNodes`) rewrites a section's `target`
(`startAnotherNode` on connect, `null` on delete) when the handle id equals the
section `id`.

### 3.2 `packages/database`

- `smartDelayTypes` (`src/partials/contact-on-smart-delay.ts`) gains
  `"quickReplyFollowUp"`. `ContactOnSmartDelayType` is a PG enum.
- New partial unique index `ContactOnSmartDelay_quickReplyFollowUp_active_key`
  on `(workspaceId, contactInboxId, flowId, nodeId)`
  `WHERE status NOT IN ('completed','failed','canceled') AND type = 'quickReplyFollowUp'`
  (the existing follow-up index is keyed on `stepId` and scoped to `type = 'followUp'`).
- **Two migrations**: (1) `ALTER TYPE "ContactOnSmartDelayType" ADD VALUE 'quickReplyFollowUp'`;
  (2) the index. Postgres rejects using a newly added enum label in the same
  transaction. Generate with `make:migration`, trim unrelated snapshot drift,
  show SQL, **do not apply without approval**.
- `ConversationAttributes.challenge` becomes
  `ConversationStepChallenge | ConversationQuickReplyChallenge`, the latter
  `{ type: "quickReply", data: { flowId, flowVersionId?, nodeId, attempts, maxRetries, sentAt } }`.
  Readers of the step variant (`get-user-data.ts`, `challenge.ts`) narrow on `type`.

### 3.3 `packages/worker-config`

- `IntegrationJobRunChallenge.data.challenge` widens to the union above.
- New action `resumeQuickReplyFollowUp` with `data: { smartDelayId }`. A
  separate action (not a branch in `runFollowUpResume`) because its handler
  must import `flow.ts`, and `follow-up.ts` is reachable from `flow.ts`'s own
  imports — a branch would create a circular import. The smart-delay scanner
  picks it up through `smartDelayResumeJobFactories`.

### 3.4 `packages/business`

- `smartDelayService.upsertQuickReplyFollowUp({ data })` — upsert on the new index (restart on re-send).
- `smartDelayService.cancelQuickReplyFollowUps({ workspaceId, contactInboxId?, conversationIds?, exceptNodeId?, exceptFlowId? })` — CAS to `canceled`.
- `smartDelayService.cancelQuickReplyFollowUpsForStaleVersion({ workspaceId, flowId, currentFlowVersionId })`.
- `conversationService.clearQuickReplyChallenge({ workspaceId, conversationId, nodeId?, exceptFlowId? }): boolean` — never touches a `type: "step"` challenge.
- `conversationService.setQuickReplyChallengeAttempts({ …, nodeId, fromAttempts, toAttempts }): boolean` — CAS on `attempts`.
- `conversationService.clearQuickReplyChallengesForStaleVersion({ workspaceId, flowId, currentFlowVersionId })`.

## 4. Builder UI (`apps/builder/src/features/flows/react-flow/`)

### 4.1 Settings dialog — live

- `nodes/quick-reply-settings/quick-reply-settings-dialog.tsx`, opened from a
  ghost icon button (`Settings2Icon`) next to `+ Quick reply` in
  `NodeEditorQuickReplies` (`nodes/editor.tsx`, which now receives `nodeId`),
  rendered only when `quickReplies.length >= 1`.
- Uses the node form via `useFormContext()`; fields bound at
  `quickReplySettings.*`. Changes flow through the existing `FlowValueSync` →
  `pushToFlow` debounce (live save, undo snapshot, autosave). No footer.
  On first open of a legacy node, `setValue("quickReplySettings", quickReplySettingsDefaultFn())`.
- Title: "Configure quick replies".
- **Follow-up section:** `SwitchField` "Follow up if contact hasn't engaged".
  When on: "Wait for" number input + unit select (minutes/hours/days only);
  helper hint about the Messenger/Instagram 24h window; divider "If contact
  hasn't engaged, follow up with"; `NextStepPicker`.
- **Retry section:** `SwitchField` "Retry if reply isn't a Quick reply" —
  disabled with tooltip when the node contains a `getUserData` step. When on:
  "Retry message" (`TiptapEditorField` with bot-field variables, max 255;
  prefilled with `t("flows.quickReplySettings.retry.messageDefault")` on first
  enable; hidden when retries = 0); "Number of retries" select (0–5 times,
  stored as a number); divider "When number of retries is exceeded";
  `NextStepPicker`.
- Switching a toggle off keeps its values but removes that section's edge;
  switching back on restores the edge.
- Errors inline in the dialog and via the node `ErrorAlert` (the existing
  `quickReplies` error collection also collects `quickReplySettings`).

### 4.2 Next-step picker (nested modal)

- `nodes/quick-reply-settings/next-step-picker.tsx`, props `{ nodeId, sectionName }`.
  - No target: dashed "Choose next step ⌄" button → small dialog listing
    `AllButtonOptions` with `hiddenButtonTypes = ["openWebsite", "whatsappOptionList"]`.
  - With target: `ActiveButton` (icon, label, ✕ to clear, `beforeStep` editor
    at `${sectionName}.target.beforeStep`).
  - No `ButtonSteps` (target only).
  - An effect keeps the edge `${section.id} → beforeStep.nodeId` in sync with
    the target (covers combobox retargeting and toggling off).
- Refactor `button-editor-dialog.tsx`: export `AllButtonOptions` /
  `ActiveButton` (`ActiveButton` gains `beforeStepName`, default `"beforeStep"`),
  and move the edge helpers and the per-type target creation into
  `hooks/use-button-target.ts` (`useHandleEdges`, `useCreateButtonTarget`).
  `ButtonEditorDialog` and `NextStepPicker` both use them.

### 4.3 Canvas

- `nodes/quick-reply-settings/quick-reply-settings-handles.tsx` renders
  `listQuickReplySettingsHandles(details)` below the quick replies in
  `nodes/viewer.tsx` and `nodes/analytics-viewer.tsx`: labelled rows "No
  engagement" / "Retries exceeded", `BaseHandle` id = section `id`, edge type
  `buttonedge`. Drag-connect / edge delete go through the existing
  `onConnect` / `onEdgesDelete` → `applyRouteUpdatesInNodes` path, which the new
  `routable-handle` accessor (§3.1) handles.

### 4.4 Other touch points

- `toolbar/duplicate-node-data.ts`: regenerate both section ids; a section whose
  target follows an edge is copied as `enabled: false, target: null` (the copy
  has no edges); external targets are kept.
- Node copy (`replaceIds`) already rewrites all `id` keys.
- Flow node cascade (invariant 16) does **not** apply — no new node type.
- i18n: `flows.quickReplySettings.*` and `messages.quickReplyNextStepRequired |
  quickReplyRetryMessageRequired | quickReplyRetryWithGetUserData` in all 21
  `apps/builder/messages/*.json` files.
- Webchat (`features/messages/actions/create-webchat-message.action.ts`):
  taps arrive as a postback on the same message and, unlike webhook channels,
  were not excluded from challenge routing. New helper
  `shouldRunWebchatChallenge(challenge, hasPostback)` skips `runChallenge` for a
  `quickReply` challenge when the message carries a postback (Get User Data
  behaviour unchanged).

## 5. Runtime (`apps/worker`, `packages/business`)

Two modules, split to avoid an import cycle:
- `handlers/quick-reply-settings.ts` — `armQuickReplySettings`,
  `clearQuickReplyPendingOnFlowEntry`, `clearQuickReplyChallengeOnTap`. Imported
  by `flow.ts`; must not import `flow.ts`.
- `handlers/quick-reply-resume.ts` — `runQuickReplyChallenge`,
  `runQuickReplyFollowUpResume`, `routeQuickReplyTarget`. Imports `flow.ts`.

### 5.1 Arm

In `runStepsAndQuickReplies` (`flow.ts`), right after the quick-reply carrier
step has been sent (`quickReplyCarrier.id === currentStep.id`), for
`targetType === "node"` and a non-`wait`/`retry` result. The carrier may run in
a later per-step job, so this does **not** require `!startFromStepId`.
- Retry on → write `challenge = { type: "quickReply", data: { flowId, flowVersionId (if pinned), nodeId, attempts: 0, maxRetries, sentAt } }`.
  Retry off → clear any earlier `quickReply` challenge (the latest quick-reply node supersedes).
- Follow-up on → cancel other nodes' active quick-reply follow-ups for the
  contact inbox, then `upsertQuickReplyFollowUp` via `scheduleSmartDelayResume`
  at `now + duration` (`stepId` = `followUp.id`, `nodeId` = the source node).
- No carrier for the channel → nothing armed. Arming errors are logged
  (`{ err }`) and never break the flow.

### 5.2 Inbound message

- **Taps.** On webhook channels a message with a sanitized `postbackAction` /
  `quickReplyAction` already has `isFromContact = false` and never reaches
  challenge routing (worker.ts:188-196); webchat is covered by §4.4. In
  `runFlowAction` (every tap, any channel), a pending `quickReply` challenge is
  cleared before the tapped route runs. **Invariant: a quick-reply tap is never
  counted as a non-QR reply.**
- **Other actionable message** while a `quickReply` challenge is pending →
  `routing.ts` returns `challenge` → `runChallenge` delegates
  `type === "quickReply"` to `runQuickReplyChallenge`:
  - `attempts < maxRetries` → CAS `attempts → attempts + 1`; the loser does
    nothing (concurrent messages cannot double-retry). Winner sends a synthetic
    `sendText` step (`id = retry.id`, `text = retry.message`) with the node's
    quick replies through `enqueueFlowStepMessage`; variables are resolved by
    the chat worker (`resolveContactVariablesDeep`).
  - Retry send failure → log `{ err }` and CAS the attempt back (not counted).
  - `attempts >= maxRetries` (including `maxRetries = 0`) → clear the challenge
    (CAS); the winner routes to `retry.target`.
  - Stale state (node missing in the resolved version, retry off, no quick
    replies) → clear the challenge, log, stop. No automated-response fallback:
    the challenge job does not carry the message text that
    `automatedResponseService.enqueue` needs; the contact's next message routes
    normally.
- **Follow-up engagement** is not written on inbound; it is checked when the
  timer fires (§5.3).

### 5.3 Follow-up fires

`runQuickReplyFollowUpResume` (job `resumeQuickReplyFollowUp`):
- Row must be `type = quickReplyFollowUp`, `status = scheduled`, due.
- `contactInboxService.hasIncomingMessageSince(row.createdAt)` or
  `!conversationService.ensureActive(conversation)` → CAS `scheduled → canceled`, stop.
- Otherwise CAS `scheduled → completed`, resolve the node's active follow-up
  (missing → warn, stop), clear a `quickReply` challenge for that node, and
  `routeQuickReplyTarget(followUp)`.
- 24h window handled by the existing channel send path (log + skip).
- Blocked owners: the integration processor already returns early via
  `isBlockedWorkspace(resolveWorkspaceId(job.data.data))`, and
  `resolveWorkspaceId` resolves `smartDelayId`, so no extra wrapper is needed.

### 5.4 Route to target

`routeQuickReplyTarget` builds `ButtonStepProps = { id: section.id, label: "", ...section.target, steps: [] }`
and calls `runStepsAndQuickReplies({ targetType: "quickReply", targetId: section.id, targetNodeId: sourceNodeId, … })`
— the same path a tapped quick reply uses — so node jumps follow the edge whose
`sourceHandle` is the section id, and external flow/node run their `beforeStep`.

### 5.5 Cancellation

- **Different flow entered:** at a real node entry (`targetType === "node"`, no
  `startFromStepId`, after the loop guard), `clearQuickReplyPendingOnFlowEntry`
  clears a `quickReply` challenge whose `flowId` differs and cancels
  quick-reply follow-ups with a different `flowId`. Same-flow entries keep the
  state: a node with quick replies may also have a Continue edge that runs the
  next node immediately. Within the same flow, keywords cannot fire while a
  retry is pending (Retry wins).
- **Handoff / paused:** `conversationService.updateBotEnabled(false)` drops a
  `quickReply` challenge in the same UPDATE and cancels follow-ups for those
  conversations; the legacy direct write in
  `trigger/services/handoff-executor.service.ts` gets the same treatment. The
  follow-up resume also re-checks `ensureActive`.
- **Same node re-sent / later quick-reply node:** upsert + challenge overwrite,
  and other nodes' follow-ups are canceled on arm.
- **Flow version published:** after the publish transaction,
  `flowVersionService.publish` cancels `quickReplyFollowUp` rows and clears
  `quickReply` challenges pinned to an older `flowVersionId` (errors logged,
  publish never fails). Latest-version state resolves via the stale-state rule.
- **Workspace blocked / purged:** processor gate + existing `cancelActiveForWorkspace`.

Data access: all DB writes go through `packages/business` services, except the
pre-existing legacy write in `handoff-executor.service.ts`, extended in place.

## 6. Testing

- `packages/flow-config/__tests__`: schema rules (target required, message
  required when retries ≥ 1, 0 retries allows empty message, retries > 5
  rejected, 366d cap, GUD conflict, ignored with zero QRs, legacy node parses);
  `resolveActiveQuickReplySettings`, `listQuickReplySettingsHandles`,
  `quickReplyNextStepFollowsEdge`, trigger time; routable-handle connect/delete
  keeps the section id.
- `apps/worker/__tests__`: arm (legacy no-op, challenge write, follow-up
  schedule + supersede, errors swallowed); clear on entry (same flow keeps,
  other flow clears, never clears a step challenge); tap clears; flow.ts arms
  after carrier and not for tap targets; retry send with quick replies, CAS
  loser no-op, failed send rolls back, exceeded → target, 0 retries → target,
  stale → clear; follow-up fires/routes, replied → cancel, inactive → cancel,
  wrong type ignored; `runChallenge` delegates `quickReply`.
- `apps/builder/__tests__`: `shouldRunWebchatChallenge`; `duplicate-node-data`
  regenerates section ids and drops edge-routed targets.
- Migration: SQL review only; never auto-applied.
- Gate: `pnpm fix`, `pnpm lint`, check-types for flow-config, database,
  worker-config, business, worker, builder; workspace tests; `pnpm check:circular`;
  `invariant-guard` agent.

## 7. Out of scope (v1)

Analytics counters; additional steps on targets; message tags outside the 24h
window; seconds unit; quick-reply settings on node types other than Send Message.

## 8. Resolved planning questions

- Follow-up index: existing one is `(workspaceId, contactInboxId, flowId, stepId)`
  scoped to `type = 'followUp'`; a new partial index on `nodeId` is added (§3.2).
- Handoff hook: `conversationService.updateBotEnabled` plus
  `HandoffExecutorService.execute` (§5.5).
- Publish hook: `flowVersionService.publish`, after the transaction (§5.5).
- Tap vs text: webhook channels already exclude taps from challenge routing;
  webchat did not and gets `shouldRunWebchatChallenge` (§4.4).

## 9. Revisions made during planning

1. Handle id moved from the target to the section (`followUp.id` / `retry.id`).
2. Follow-up engagement checked lazily at fire time instead of cancel-on-every-inbound.
3. "Contact enters another flow" narrowed to a different `flowId` (Continue-edge case).
4. Follow-up fires through a new `resumeQuickReplyFollowUp` job (avoids an import cycle).
5. Stale retry state clears and stops (no automated-response fallback).
6. Legacy settings backfilled when the dialog opens, not in `upgradeNodeSteps`.
7. No extra `withBlockedOwnerGuard`: the integration processor already gates by workspace.
8. Two migrations (enum value, then index).
9. Webchat tap guard added.
