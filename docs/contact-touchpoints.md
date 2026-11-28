# Contact touchpoints ("Opted In through")

The first section of the inbox contact panel lists how a contact came in and which tools
they took part in, newest first. It is a **derived feed**: no table stores it, every page
is read from the source tables. Appointments, coupons and ads are not kinds; each has its
own section and operation.

- Repository: `packages/database/src/repositories/contact-touchpoint/repository.ts`
- Service: `contactTouchpointService.list` (`packages/business/src/contact-touchpoint/service.ts`)
- Private: `contacts.listContactTouchpointsAuthenticatedAPI`; public: `GET /v1/contacts/{identifier}/touchpoints` (`contacts.listTouchpoints`, CLI `chatbotx contacts touchpoints`). Both call the same service method; the private one passes the member's contact access scope.
- UI: `features/contacts/components/contact-touchpoints-list.tsx`. Labels, icons and links come from `TOOLS_CONFIG`; the inbox source label from `condition.sources.*`.

## Kinds

One row per resource, placed by `occurredAt`; the row's unique key is `(kind, resourceKey)`.

| Kind | Source | One row per | `occurredAt` |
|---|---|---|---|
| `inboxSource` | `ContactInbox` (+ `Inbox` for the workspace) | connection | `firstInteractionAt`, else `createdAt` |
| `postComment` | `ContactInboxPost` + `ChannelPost` | post, across the contact's inboxes (removed posts hidden) | earliest comment |
| `minigame` | `MinigameContact` + latest `MinigamePlay` | game | latest play, else `openedAt` |
| `leaderboard` | `LeaderboardParticipant` | live board (deleted hidden) | `lastActivityAt` |
| `questionnaire` | `QuestionnaireSubmission` | questionnaire (deleted hidden, cancelled, failed and timed-out attempts ignored) | latest completion (its last update when never stamped), else the attempt in progress |
| `miniApp` | `MiniAppSubmission` | app | latest submission |
| `poll` | `PollVote` | poll | `updatedAt` (a re-vote overwrites) |
| `leadForm` | `FacebookLeadAdsLead` | lead automation | latest lead |
| `inboundWebhook` | `InboundWebhookRequest` with status `processed` or `completedWithErrors` | webhook | latest request; the log keeps 30 days |
| `commentAutomation` | `CommentAutomationEvent` | automation | latest event |
| `refLink` | `RefLinkStat` | link (`details.linkType` is `refLink` or `qrCode`) | latest visit |
| `magicLink` | `MagicLinkStat` | link | latest click |
| `form` | `ContactActivity` `formCompleted` / `whatsappFlow` | WhatsApp Flow | first completion since activity tracking began |

Tables without `workspaceId` (`MinigameContact`, `MinigamePlay`, `FacebookLeadAdsLead`,
`WhatsappFlow`) are scoped through their parent (`Minigame`, the lead automation, the WhatsApp
integration). Every other branch filters `workspaceId` directly.

## Exactness and cost

There is no scan cap, so a count can never silently drop an older resource. Each branch reads only
this contact's rows through the contact index. Event logs are grouped per resource
(`max(time)`, `count(*)`); membership tables already hold one row per (contact, resource).
The cursor predicate and `LIMIT perPage + 1` run **inside** each branch (on the grouped values for
a grouped branch); the outer `UNION ALL` orders by `occurredAt DESC, kind DESC (COLLATE "C"), resourceKey DESC`
and keeps `perPage + 1`.

Measured with `EXPLAIN (ANALYZE, BUFFERS)` on one contact with 100,000 rows in every event table
(plus 200,000 rows of another contact in the same tables): every branch is 20 ms or less except
`postComment`, which is about 125 ms at 100,000 distinct posts (about 16 ms at 10,000): the cost is
the join and grouping of one row per post, which no index removes. A single contact commenting on
100,000 posts is far beyond real data.

`MagicLinkStat` had no contact index; `MagicLinkStat_workspaceId_contactId_occurredAt_idx` was added
by its own `CONCURRENTLY` migration (the table is a hot insert path). That migration is re-runnable:
a build that failed leaves an INVALID index, which the guard at the top of the migration drops first.

## Live view

The feed is not a snapshot. A "latest" row can move to an earlier page between two calls. The client
de-duplicates by `(kind, resourceKey)` (the earlier page wins) and a refetch starts from page 1. The cursor
is opaque; it carries the timestamp as the database's own microsecond text, because a JavaScript `Date`
keeps only milliseconds and would skip or repeat rows that share one. A cursor that does not decode is a
400 `invalidCursor`, never a silent restart.

## Adding a kind

1. Add it to `contactTouchpointKinds` and its `details` schema to `contactTouchpointDetailsSchemas`
   (`packages/database/src/partials/contact-touchpoint.ts`); the TypeScript record types fail until every map has it.
2. Add its branch to `branchBuilders` (workspace scope, soft-deleted parents hidden, a contact index; run `EXPLAIN`).
3. Add its rule to `CONTACT_TOUCHPOINT_KIND_RULES` and a resource to `contactTouchpointResource`
   (`features/contacts/schema/touchpoint.ts`).
4. Map it to its Tools card in `contact-touchpoints-list.tsx` and add its detail line and `contactTouchpoints.*` strings in every locale.

## Workspace purge

No new table. The new index is on `MagicLinkStat`, which the workspace purge already drains.
