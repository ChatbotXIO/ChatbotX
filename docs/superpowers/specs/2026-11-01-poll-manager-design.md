# Poll Manager — Design

Date: 2026-11-01
Status: Draft for review

## Intent

Add a **Poll Manager** tool so a workspace can run polls/votes inside its chat
channels and collect customer opinions. The owner sets up a poll campaign
(name, dates, image, candidates), shares a link per channel, and contacts vote
by tapping buttons in carousel cards. The owner sees results per candidate and
per gender.

Tools-list card description (i18n `pollManager.description`, replace the
current text): **"Conduct polling or voting systems. You can use it to collect
customers opinions also."** The card already exists in
`apps/builder/src/features/tools/tools-list.tsx` (`id: "poll-manager"`, no
`getLink`, so it renders disabled) — wire `getLink` to `/space/${id}/polls`.

Agent-first (AGENTS.md invariant 23): every operation below ships as a public
API procedure first; the UI calls the same service methods.

## Goals

1. CRUD for polls with candidates, from UI and public API.
2. Per-channel entry links + an omnichannel landing page.
3. In-chat voting via carousel cards with postback "Vote" buttons on every
   channel that supports carousels and refs.
4. Analytics: votes and percentages per candidate, overall and by gender.

## Non-goals

- Polls as a flow step / sending a poll from a flow or broadcast (not asked).
- Multiple-choice / ranked voting, free-text answers.
- Showing results to voters.
- Enable/disable toggle (the date window is the only gate).
- Zalo, TikTok, Threads, SMTP: no links, no voting.

## Anti-goals

- A vote button that silently does nothing or is treated as typed text.
- Counting one contact more than once in a poll.
- A Get Link dialog that offers a link whose channel drops the ref.
- Any UI-only operation without a public API.

## User-facing behaviour

### 1. Create / edit poll (form, screenshot "Part 1")

Card 1:
- **Name** (required).
- **Start date**, **End date** (required, datetime; end > start). Reuse
  `features/minigames/components/date-time-range-field.tsx` if it fits.
- **Image** (required — it is the card image) — media-library upload like
  other tools.

Card 2 — "Candidates or Options", repeatable, **2–10 candidates**
(decided: WhatsApp carousels need 2–10 cards, and a one-option poll is not a
poll; "Add More" stops at 10, Delete is disabled at 2):
- **Name** (required, max 60 chars, counter shown).
- **Description** (optional, max 500 chars, counter shown).
- **Image** (optional by default — builder decides fallback when absent, e.g.
  poll image; Messenger generic template allows no image).
- **Delete** link per candidate; **Add More** link.

"More Options" (collapsible):
- **Flow to be sent after the user vote** — flow picker, default "None".

Save button. Clicking a list row opens this same form for editing.
Removing a candidate that already has votes **deletes those votes**; the form
warns before save (decided).

Candidate order in the form = order in the carousel.

### 2. List page (screenshot "Part 2")

Route `/space/[workspaceId]/polls`. Title "Poll Manager", **Add** button,
search by name, multi-select bulk delete. Columns: Name, Start Date, End Date,
Votes (count of current votes). Row menu: **Get Link**, **View Analytics**,
**Delete**. Mirror the minigames table structure.

### 3. Get Link (screenshot "Part 3")

Dialog lists, each with a **Copy** button:
- **Omnichannel** — `${appUrl}/l/...` style landing page listing every
  ref-capable connected inbox with a **Continue** button (reuse
  `InboxListLandingPage`; redirect directly when only one link exists, as the
  QR-code landing page does).
- One row per connected inbox in `REF_CAPABLE_CHANNELS` (Messenger, Instagram,
  WhatsApp, Telegram, Webchat), built with `buildInboxLink` and a new ref type.

Ref: add `{ type: "poll", pollId }` to `RefConfig` in
`packages/business/src/referral/utils.ts`, prefix `pl_` + base62 id (same
charset rules as `mg_`/`lb_`). Example shapes:
`m.me/<page>?ref=pl_xxx`, `ig.me/m/<user>?ref=pl_xxx`,
`wa.me/<phone>?text=/ref-pl_xxx`, `t.me/<bot>?start=pl_xxx`,
webchat `...&ref=pl_xxx`.

Landing page route: builder decides — either generalise
`app/l/[workspaceId]/[id]` (currently QR-code-only) or add a sibling route;
must be registered in `proxy.ts` `publicRoutes` if new. Filter by
`canReceiveRef`/`REF_CAPABLE_CHANNELS` (the QR page currently does not).

### 4. Voting conversation (screenshots "Part 4")

**On link open** (`runRef` gets `type: "poll"`): mirror the minigame branch in
`apps/worker/src/integration/handlers/ref.ts` — `findUnscoped`, workspace
match guard, stale/missing poll is a no-op (no retry). Send a carousel with
**one** element:
- image = poll image, title = poll name,
- subtitle by state (dates in **workspace timezone**, localised format):
  - running: "Voting started | <start> - <end>" + **Vote** button,
  - ended: "Voting is over | <start> - <end>", no button,
  - not started yet (decided): "Voting starts soon | <start> - <end>", no
    button.

**WhatsApp single card (decided):** WhatsApp rejects one-card carousels, so
wherever a one-element carousel would be sent on WhatsApp, send an image
interactive message (image, body = title + subtitle, Vote reply button when
running) instead. Same content, different message type.

**Tap Vote on poll card** → carousel of candidates (image, name, description
truncated per channel limits), each with a **Vote** button. Re-check the
window at tap time; if the poll is no longer running, resend the poll card in
its current state instead.

**Tap Vote on a candidate** → record vote, then send text
"Your vote was successfully registered." with a **Polls** quick reply on
channels whose policy supports quick replies (not WhatsApp — it has no
`sendQuickReply` step; builder may decide whether WA gets a reply button
instead or nothing). Then, if configured, send the "flow after vote" via
`IntegrationJobAction.sendFlow` (pattern:
`minigame-contact-service.ts` outcome flow).

**Tap Polls** → carousel of the workspace's polls, **newest 10 by creation,
including expired**, each element in its current state (button only when
running).

**WhatsApp Polls list (decided):** WhatsApp requires every carousel card to
have the same buttons, so on WhatsApp the list shows **only running polls**
(newest 10). One running poll → the single-card image message above; zero
running polls → builder's call (e.g. a translated "No polls are open right
now" text).

**Vote rules (decided):**
- One vote per contact per poll. Voting again **changes** the vote to the new
  candidate (unique `(pollId, contactId)`; upsert).
- Every vote tap gets the same success message.
- "Flow after vote" runs only when the vote is **new or changed to a different
  candidate** (decided). Tapping the same candidate again (double tap,
  redelivered postback) is a no-op beyond the success message. The upsert
  must report `new | changed | unchanged` atomically so two concurrent taps
  cannot both count as new (`reliability-concurrency` skill).
- Votes are keyed by **contact**, not contact-inbox, so the same person on two
  channels of the same contact counts once.

**Bot strings are translated into the workspace language**
(`Workspace.language`), falling back to English: "Vote", "Polls",
"Voting started", "Voting is over", "Voting starts soon",
"Your vote was successfully registered.". The worker has no i18n today; add a
small server-side message catalogue for these strings covering the same
locales as `apps/builder/messages/*.json` (21 locales). Where it lives is the
builder's call (e.g. a module in `packages/business/src/poll/`).

**Channels:** Messenger, Instagram, WhatsApp, Telegram, Webchat. Gate sends
through `getChannelFlowPolicy(channel)` (carousel, quick reply, button label
and count limits, WhatsApp carousel rules in
`steps/whatsapp-carousel-rules.ts`).

### 5. Analytics (screenshot "Part 5")

Route under the poll, e.g. `/space/[workspaceId]/polls/[id]/analytics`.
- Header: poll image, name, date range, total votes.
- Table per candidate: Name, Total votes, T%, Male votes, M%, Female votes, F%.
  - T% = candidate votes / all votes in poll.
  - M% = candidate male votes / all male votes in poll; F% likewise (decided).
  - 0 denominators show 0%.
- Pie "Results": votes per candidate.
- Pie "Votes per gender": male / female / unknown (null gender counts as
  unknown).
Gender comes from `Contact.gender` at query time (join), not snapshotted —
builder's call if that should change. Read the `dataviz` skill for charts.

## Technical constraints and decided approach

### Postback handling (the one genuinely new mechanism)

Today every carousel button postback is encoded as a flow-button payload
(`encodeButtonPayload` in `packages/flow-config/src/util.ts`);
`sanitizeFlowAction` in `received-message.ts` drops payloads that don't decode,
so the tap becomes plain text. Raw-prefix postbacks
(`appointment_cancel:<token>`, parsed before `sanitizeFlowAction`) work only
for quick replies sent via `sendChatMessage`.

The builder must pick one of:
- (a) the AI rich-response pattern — synthetic `sendCarousel` steps sent with
  `ChatJobAction.sendFlowMessage` and a `buttonPayloads` map persisted on the
  Message, resolved in the flow fallback (`tryRunRichButtonFallback`), adding a
  `poll` payload kind; or
- (b) a raw `poll:<...>` postback prefix, extending each channel's carousel
  converter to pass a raw payload through, parsed before `sanitizeFlowAction`
  like appointment-cancel.

Either way: payloads must be tamper-safe enough that a contact cannot vote
for a candidate of another poll or workspace (validate pollId ↔ candidateId ↔
workspace server-side on every tap), and every in-scope channel must be
covered by a test. Run the `security-review` skill on this part.

### Data model (shape decided, names are the builder's)

- `Poll`: id, workspaceId, name, imageUrl, startsAt, endsAt, afterVoteFlowId
  (nullable, FK set null on flow delete), timestamps. Index
  `(workspaceId, createdAt)`.
- `PollCandidate`: id, pollId, position, name, description, imageUrl.
  Cascade on poll delete.
- `PollVote`: id, workspaceId, pollId, candidateId, contactId, contactInboxId
  (channel it came from), timestamps. Unique `(pollId, contactId)`. Cascade on
  poll/candidate/contact delete.
- Every FK has a leading index; register purge coverage
  (`workspace-purge` skill, `workspace-purge-coverage.test.ts`).
- Generate the migration, inspect it, **do not apply without approval**.

### Layers

`features/polls/api/public.ts` → `@chatbotx.io/business` `poll` service →
repositories → DB. Worker ref/postback handling calls the same service.
Mirror minigames layout (`packages/business/src/minigame/`,
`apps/builder/src/features/minigames/`). Keep Node-only code out of the
router graph (invariant 25).

### Public API (scope: builder picks, e.g. `polls`)

- `polls.list` (search, pagination, includes vote count)
- `polls.get` (with candidates)
- `polls.create`, `polls.update` (candidates replaced as a list; ids kept for
  existing ones so their votes survive)
- `polls.delete`, `polls.bulkDelete`
- `polls.getLinks` → `{ omnichannelUrl, links: [{ inboxId, channel, url }] }`
- `polls.getAnalytics` → totals and per-candidate/per-gender counts and
  percentages as data
Descriptions name the source of ids (e.g. "Get poll ids from `polls.list`").
Then run the `cli-mcp-docs` skill.

### Quota / plan

No quota gate (builder's call if an existing tools limit applies).

## Left to the builder

- Exact table/column names, route names, ref prefix spelling.
- Postback mechanism (a) vs (b) above.
- Landing page: generalise vs new route.
- Candidate image fallback, truncation details per channel.
- WhatsApp behaviour for the "Polls" quick reply.
- Where the bot-string catalogue lives.
- Date format per locale.
