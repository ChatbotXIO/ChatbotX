# Working Hours

Workspace-level weekly schedules for human agents, and agent response-time metrics measured raw and **within working hours**.

Not to be confused with `Workspace.startTime/endTime` (`workspaceService.isActiveNow`), which are the **bot's** active hours.

## Data model

| Table | Purpose |
|---|---|
| `WorkingHours` | A schedule: `workspaceId`, `name`. Unique `(id, workspaceId)` backs the composite FK below. |
| `WorkingHoursInterval` | `workingHoursId`, `weekday` (0=Sunday..6=Saturday), `startMinute`, `endMinute`. DB `CHECK`s: `weekday` 0..6, `0 <= startMinute < endMinute <= 1440`. A day is "on" iff it has at least one interval. |
| `WorkingHoursMember` | `workingHoursId`, `workspaceId`, `userId`. Unique `(workspaceId, userId)` = one schedule per member. Composite FK `(workingHoursId, workspaceId)` keeps the denormalised `workspaceId` consistent. |
| `Conversation` (3 new nullable columns) | `awaitingHumanReplySince`, `awaitingHumanReplyClosedAt`, `assignedUserAt`. |
| `AnalyticsAgentResponseEvent` | Timescale hypertable, one row per answered window (PK `(occurredAt, eventId)`). |

Code: schema in `packages/database/src/schema/working-hours*.ts` and `schema/analytics/agent-response-event.ts`; zod in `packages/database/src/partials/working-hours.ts`; service/measurement in `packages/business/src/working-hours/`; window SQL in `packages/business/src/conversation/human-reply-window.ts` and `packages/database/src/repositories/conversation/repository.ts` (`closeHumanReplyWindow`).

## Schedule semantics

- Timezone is always the **workspace** timezone (`Workspace.timezone`, via `resolveWorkingHoursTimezone`; an invalid zone falls back to `UTC` with a warning). There is no per-schedule timezone.
- `weekday`: 0 = Sunday ... 6 = Saturday. `startMinute`/`endMinute` are minutes since local midnight, **end-exclusive**; `24:00` is `1440` (next local midnight).
- Validation: bounds as above, at most 10 intervals per weekday and 70 in total, no overlap on a weekday, `end > start`. Overnight spans use two rows (one ending at 1440, one starting at 0 the next weekday).
- **One schedule per member per workspace.** Setting members of schedule B (create with `userIds`, or `setMembers`) **moves** users already on schedule A to B (`INSERT ... ON CONFLICT (workspaceId, userId) DO UPDATE`). Users must be workspace members. Removing a user from the workspace deletes their schedule row. A user with no schedule is measured on wall-clock time only.
- Interval and member writes lock the parent `WorkingHours` row; member writes first take a per-workspace advisory lock. A rename-only update relies on the UPDATE's own row lock; delete is a single statement.
- Duration inside a schedule (`workingSecondsBetween`) walks local calendar dates, converts each interval to instants, clips to the window and sums. DST: a nonexistent local time (spring gap) resolves to the transition instant; an ambiguous time (fall back) resolves to its **first** occurrence. A schedule edit applies to replies measured afterwards.

## Waiting window state machine

`Conversation.awaitingHumanReplySince` is the start of the open window in which a contact is waiting for a human; `awaitingHumanReplyClosedAt` is the last **human** close instant (stale, out-of-order inbound events older than it are ignored); a bot close clears the window but does not advance it. Only DM conversations (`sourceId IS NULL`) are measured; comment threads never open a window.

| Event | Where | Effect |
|---|---|---|
| Contact message, any channel | `recordInboundActivity` (worker `received-message.ts`) | Opens the window at the message time (keeps the earliest open start). |
| Contact message, webchat (builder) | `create-webchat-message.action.ts` via `updateFlowStepState` | Same open (no longer a direct db write). |
| Native-app outgoing echo (human replied outside ChatbotX) | `received-message.ts` | Closes (`externalHuman`), **no event**, only for first-party/unclassified echoes; third-party app and Meta AI (`keepUnread`) standby echoes do not close. |
| Bot message (flow step, `sendChatMessage`) | `recordOutboundFlowStep`, `recordOutboundMessageActivity` | Closes (`bot`) **only if `botEnabled`**; a conversation whose bot is paused stays waiting for a human. Does not advance `awaitingHumanReplyClosedAt`, so a later pause still reopens. An inbox-originated flow step (`sendFrom: "inbox"`) does not close here: `createOutgoing`'s claim owns it. |
| Proactive/bulk sends: broadcast, sequence, bulk outbound, WhatsApp/Messenger template handlers, private reply / AI-handover bulk takeover (`recordDeliveredDirectMessage`) | same | Pass `closeHumanReplyWindow: false`; do not close. |
| Bot paused / handover | `updateBotEnabled(false)`, `handOffIfBotEnabled` (trigger handoff executor) | **Opt-in** (`reopenUnansweredHumanReplyWindow`): only pauses that react to the contact's message pass it: the flow step Disable Bot (`stepDisableBot`) **only for message-driven flow runs** (job flag `startedByContactMessage`, set by the keyword / default-reply / AI-triggered / global-router flow starters, button and quick-reply taps and challenge answers, forwarded through same-run continuations and dropped by wait / smart-delay / heavy-step resumes, broadcast, sequence and trigger-started runs; unknown origin = no reopen) and the handoff executor for AI tools, automated replies, rich-response and the global router. Manual UI/API pause, bulk thread control, thread-control handback and trigger actions (`disableBot`, `transferConversationToHuman`, which can fire on non-message events) do not. When opted in, reopens at `contactRepliedAt` **only if** the contact's last message is unanswered (no later `adminRepliedAt`, not before `awaitingHumanReplyClosedAt`, which only human closes advance). |
| Archive | `updateArchived(true)` | Closes (`archive`). |
| Human reply (inbox create-message action, inbox "send flow", session messages API `messages/api/private.ts`) | `createOutgoing` -> `markAgentReplied` -> `closeHumanReplyWindow` | Serialized claim (`FOR NO KEY UPDATE`): closes the window and reports the closed start, so two concurrent replies yield exactly one measurement. |
| WhatsApp call-permission request | `request-call-permission.ts` (passes `user`) | Counts as a human reply: closes the window and emits. |
| Workspace-token / `api` / `system` sender (`messages.create`, `contacts.sendMessage`; no user) | `createOutgoing` | Also claims the window and sets `adminRepliedAt` (so a later human reply is not a first response) but emits **no** event. |
| Agent template send (worker `humanSender`), customer-placed WhatsApp call | - | Unchanged: not a reply, opens no window. |

Existing rows start with `NULL` columns; measurement begins at the next contact message / assignment. No backfill.

## Measurement semantics

- **First response**: the reply that closes a window on a conversation whose `adminRepliedAt` was `NULL` (never answered by a human/API). It is not reset when a conversation is unarchived.
- **Start of measurement** (`resolveMeasuredFrom`): the window start, unless the conversation is assigned to the *replying* agent after the window opened, in which case the start is `assignedUserAt`. Examples: customer 09:00, assigned to Binh 11:00, Binh replies 11:05 = 5 min; nobody assigned = 2 h 05 min; assigned before the message = from the message; reassigned An to Binh at 10:00, reply 10:03 = 3 min. Team-only assignment never moves the start. `assignedUserAt` is the instant `assignedUserId` last changed to a non-null user (`NULL` on unassign); writers: `updateAssignment`, `assignUserIfUnassigned`, `assignTargetIfUnassigned` (only when a user is set).
- **Response time** (`responseSeconds`) = reply time - start, wall-clock. **Within working hours** (`workingResponseSeconds`) = the part of that span inside the replying agent's schedule at reply time; `null` when the agent has no schedule. `awaitingSince` (the original window start) is stored too.
- Computed at the source (`createOutgoing`) in order: message row, enqueue, claim, compute, emit. A failed enqueue neither closes the window nor records a reply.
- Aggregates: `avg*` fields are rounded whole seconds, `null` when there is no data (never 0). Departed agents drop out of the table (only current members are merged).

## Event and analytics pipeline

`createOutgoing` emits `analytics:dashboard` with `eventType: "agent:replied"` and `eventId: "reply:<messageId>"` (`reply:flow:<id>` for inbox "send flow") -> worker `apps/worker/src/events/analytics/agent-response.ts` (registered in `listener.ts`) -> `agentResponseAnalyticsService.recordEvents` -> `AnalyticsAgentResponseEvent` with `onConflictDoNothing` on `(occurredAt, eventId)`, so redelivery is idempotent. Rows with `measuredFrom >= occurredAt` or negative seconds are dropped with a warning. The emit is **best-effort**, not transactional with the claim. Timescale: 30-day chunks, compression after 30 days (`segmentby workspaceId`), 10-year retention. No continuous aggregate.

## Public API (scope `inbox`, tag "Working Hours", router key `workingHours`, hidden from the default MCP tool set)

| Operation | Route | Notes |
|---|---|---|
| `workingHours.list` | `GET /v1/working-hours` | paginated |
| `workingHours.get` | `GET /v1/working-hours/{id}` | |
| `workingHours.create` | `POST /v1/working-hours` | 201; `name`, optional `intervals`, `userIds` |
| `workingHours.update` | `PATCH /v1/working-hours/{id}` | `name?`, `intervals?` (full replacement); at least one required |
| `workingHours.delete` | `DELETE /v1/working-hours/{id}` | 204; members revert to wall-clock timing |
| `workingHours.setMembers` | `PUT /v1/working-hours/{id}/members` | `userIds` full replacement (empty clears); moves users |

`get`, `create`, `update` and `setMembers` return one resource `{ id, name, intervals[], memberUserIds[], createdAt, updatedAt }` (`workspaceId` is omitted); `list` returns a paginated envelope of that resource; `delete` is 204 with no body. Get user ids from `workspaceMembers.list`. `create`, `update` and `setMembers` call `assertWorkspaceNotBlocked`; `delete` stays available for blocked/expired workspaces (invariant 14).

Public `conversations.*` resources now expose `awaitingHumanReplySince` and `assignedUserAt` and omit `awaitingHumanReplyClosedAt`.

Error codes: `notFound` 404 (unknown id); `validation` 422 (business rule, e.g. a `userIds` entry that is not a workspace member); `invalidRequestData` 422 (schema failure: overlap, out-of-range minutes, more than 10 per weekday / 70 total, more than 1000 `userIds`, empty update); `businessError` 400; auth/scope 401/403 (a token without `inbox` or a `read_only` token on a mutation); idempotency 422/409 on writes.

Analytics (scope `analytics`):

- `analytics.humanAgentStats` (`GET /v1/analytics/human-agent-stats`) gains `avgResponseSeconds`, `avgWorkingResponseSeconds`, `avgFirstResponseSeconds`, `avgWorkingFirstResponseSeconds` (nullable) and `responseCount`, `firstResponseCount`.
- `analytics.agentResponseSeries` (`GET /v1/analytics/agent-response-series`): one row per `(adminId, date)` with the same measures; `date` is `YYYY-MM-DD` bucketed in the request `timezone`.

CLI: `chatbotx working-hours ...`, `chatbotx analytics agent-response-series` (see `apps/cli/README.md`).

## UI

Settings -> Inbox Teams, a Working Hours card under the Inbox Team card (list, create, rename, employees, delete) with a full-page weekly editor at `settings/inbox-teams/working-hours/[workingHoursId]` (15-minute steps; overlap blocks Save). Analytics -> Conversations -> Admins gains the four response-time columns (clock-marked = within working hours) and two per-admin daily charts. The same operations are available through the public API, which is the source of truth.

## Limitations and non-goals

- R1: the emit is best-effort; a crash between the claim and the event loses one sample, never duplicates.
- R2: replies count at message creation (humans and bots); a bot message that later fails delivery still closes the window (under-count, never fabricated).
- R3: proactive bot sends without broadcast/sequence markers close the window (under-count).
- R5: schedule or timezone edits apply only to replies measured afterwards.
- R6: the editor uses 15-minute steps; the API accepts any minute.
- R7: crediting the assignee from assignment time means a customer who waited unassigned for two hours shows as a short response for that agent; `awaitingSince` is stored on each event.
- R8: customer-placed WhatsApp calls open no window, but pausing the bot afterwards can reopen one from the call's `contactRepliedAt`.
- R9: bot closes do not advance `awaitingHumanReplyClosedAt` (so bot message then pause still measures), so a delayed older contact message processed after a bot close is not stale-guarded and can reopen a window; human closes stay guarded.
- R10: a bot close leaves no marker, so reopen-on-pause is opt-in. A manual pause (or trigger-action / handback pause, or a Disable Bot step in a broadcast, sequence, trigger-started, delay- or heavy-step-resumed or otherwise unflagged flow run) after the bot already answered does not reopen the window, so the following agent reply is not measured; if the bot never answered, the window is still open anyway.
- Not measured: comment threads, agent-initiated template sends, history (no backfill). No per-schedule timezone, no overnight intervals in one row. Not wired to routing, SLA, auto-reply or a contact filter.

## Operations

- Migration `packages/database/drizzle/20261018142305_working_hours/` is generated (including the Timescale statements) but **applied by the owner**; agents never run `db:migrate`. `pnpm --filter @chatbotx.io/database db:check-drift` guards schema/snapshot agreement; opt-in `test:db` covers constraints and the concurrent-close claim.
- The three new `Conversation` columns are nullable (metadata-only change).
- Cache: `working-hours:<workspaceId>` tag; the schedule lookup per agent is cached and invalidated on writes and member deletion.
- Migration `packages/database/drizzle/20261019032527_workspace_member_workspace_user_index/` adds the non-unique index `WorkspaceMember_workspaceId_userId_idx` on `(workspaceId, userId)` (auth membership lookups, the working-hours member check, the roster list), built with `CREATE INDEX CONCURRENTLY IF NOT EXISTS`; if a run dies midway, check `pg_index.indisvalid` and drop the invalid index before re-running.
