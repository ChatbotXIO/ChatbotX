# Find places near me — flow action

Date: 2026-10-28
Branch context: `feat/places-near-me`
Builds on: `docs/superpowers/specs/2026-10-25-places-near-me-design.md`
(Locations + Categories data, already shipped on this branch).

## Intent

A business with several physical locations wants a chat flow to send a
WhatsApp customer the closest location's pin. The flow asks for the
customer's location with the existing **Get User Data** step (reply format
**Location**, saved into a contact custom field as `lat,lng`). A new Perform
Action, **Find places near me**, reads that location, picks the nearest
location in the chosen category, and sends it as a WhatsApp
[location message](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/location-messages).

## Goals

- A new Perform Action menu group **More options** with one child, **Find
  places near me**. The group is a normal submenu so more actions can be
  added to it later.
- When added, the node editor gets an item titled **Find places near me**
  with a **category select**: one category, or **All locations**.
- The node viewer (canvas card) shows **the action name only**.
- At runtime: read the contact's stored location, find the single nearest
  location, send a WhatsApp location message (pin + location name).
- Never break the flow: every "can't do it" case is a silent skip and the
  flow continues.

## Non-goals

- Channels other than WhatsApp (they skip).
- A public API for "find nearest place" — **flow-only by the user's
  decision**. The PR must state the invariant-23 exemption reason: the
  operation is a flow-runtime side effect on a live conversation; the flow
  step itself is configured through the existing flows API.
- Fallback text, a "not found" branch / step states.
- Category rank in selection (rank is ignored here).
- A maximum distance / radius.
- Address, distance text, or category name in the message.
- Sending more than one place.

## Anti-goals

- Reading a location from a **bot field** (workspace-wide, shared across
  contacts).
- Failing or halting the flow when the action can't send.
- Hiding the action from flows that aren't WhatsApp-only — flows are
  omnichannel; the action is always available and simply skips elsewhere.

## Decisions (made by the user)

### Menu and editor
- Menu: `More options › Find places near me` in
  `apps/builder/src/features/flows/react-flow/nodes/perform-action/menu.tsx`.
  **Always shown**, regardless of connected channels.
- Editor item title = action name. Contains:
  - **Category select**: every place category of the workspace plus an
    **All locations** option ("All" includes uncategorized locations).
  - A note: *only sent to WhatsApp contacts*.
  - An **inline warning** when no upstream location source is found (see
    below). This is a warning only — **publish is not blocked**.
- Viewer: action name only.

### Where the location comes from — auto-detected from the graph
- Not chosen by the flow builder. At design time, walk **backwards through
  the flow graph** from the action's node (following incoming connections,
  across nodes) and collect **every** upstream `getUserData` step with
  `replyFormat = location` whose `outputFieldId` is a **contact custom
  field**. Steps saving to a **bot field are ignored** (and do not count as
  a source for the warning).
- The walk runs on the **executed (published, immutable) flow version** at
  runtime, so it is deterministic and can't be pointed at arbitrary fields.
  The editor runs the same walk for its warning. (Planning change: the first
  draft stored the resolved field ids on the action at publish. Deriving them
  from the published graph needs no hook on the four publish paths and no
  custom-field remap on flow import / template install.)
- Only graph connections count; a jump from another node or flow
  (`startAnotherNode`, external flow) is not followed.
- If several sources exist (e.g. different branches), at runtime use the
  one **most recently written** (`ContactCustomField.updatedAt`) that holds
  a valid value.

### Freshness — none
- **No freshness check** (user's decision after review). The newest stored
  value of any upstream source is used, even if the contact gave it in an
  earlier conversation. An earlier draft required "written after this run
  started"; it was dropped because there is no run-start anchor (`FlowRun`
  is never written) and same-value writes don't bump `updatedAt`
  (`packages/business/src/contact-custom-field/service.ts:566`).
- Value format is the existing `lat,lng` string written by Get User Data
  (`packages/business/src/get-user-data/reply-input.combinators.ts`). Not
  parseable / out of range → skip.

### Selecting the place
- **Pure nearest** by great-circle distance among locations in the chosen
  category (or all locations). Rank ignored. No distance limit.
- Ties: any deterministic order is fine (builder's call).

### Message
- WhatsApp `location` message: `latitude`, `longitude`, `name` = location
  name. **No address.**

### Skip cases (silent, flow continues, logged)
- Contact's channel is not WhatsApp.
- No upstream location source in the executed flow version.
- No source field has a value, or every value is invalid.
- Selected category no longer exists, or has no locations / workspace has
  no locations.

## Builder's calls (decided by Claude, flag if wrong)

- **Step type:** new step `findPlacesNearMe` in `@chatbotx.io/flow-config`
  (`stepTypes`), schema `{ id, nodeId?, stepType, placeCategoryId: string |
  null /* null = All */ }`. Follow the
  `flow-step-development` skill; it is a plain action (no success/error
  states). Register it in every step map (`allSteps`, perform-action
  allowed steps, publish schemas) — grep an existing perform-action step
  such as `generateCode` for every registration surface.
- **Graph walk helper:** one pure function in `flow-config`
  (`findUpstreamLocationFieldKeys`) shared by the worker and the editor
  warning.
- **Multiple sources:** newest valid value wins; an invalid newest value
  falls through to the next newest. "Most recently written" is approximate
  (same-value writes don't bump `updatedAt`); acceptable since no freshness
  rule depends on it.
- **Flow import / template install:** register `placeCategoryId` in
  `REFERENCE_FIELD_ENTITY_KIND` as a warn-only reference; an unresolved id
  just makes the action skip at runtime.
- **Deleted source fields:** a source field that no longer exists or has no
  value is treated as empty (skip if nothing else qualifies).
- **Ordering:** the Get User Data resume awaits `setValueByKey`
  (`apps/worker/src/integration/handlers/get-user-data.ts` ~L158/L282) before
  the flow continues, so the next node reads the new value.
- **Delivery:** the `whatsappLocation` step type already exists
  (`packages/flow-config/src/steps/whatsapp-location.ts`); confirm it is
  accepted by the channel-deliverable allow-list in
  `apps/worker/src/chat/handlers/send-flow-step.ts` when enqueued from this
  action.
- **Nearest query:** the repository returns candidate locations' `id, name,
  latitude, longitude` (scoped by workspace and optional category); a pure
  haversine `pickNearestPlace` in the business layer picks the closest
  (ties → lower id). Fine for hundreds to low thousands of locations per
  workspace; move ordering into SQL if one grows far beyond that. The worker
  calls `placeLocationService.findNearest`, never the repository
  (data-access rule).
- **Sending:** enqueue through the normal flow-message path
  (`enqueueFlowStepMessage`) using the existing WhatsApp location converter
  (`integrations/whatsapp/src/handlers/message/outgoing-message/whatsapp-location.ts`)
  — e.g. build a `whatsappLocation` step payload — so ordering, storage and
  inbox display match other flow messages. No 24-hour-window special
  handling: the contact just shared their location.
- **Category select data:** existing place-categories query, sorted rank
  then name; a deleted category shows as empty/invalid in the editor.
- **Logging:** `logger.info({ ..., reason }, "findPlacesNearMe: skipped")`
  with a reason code per skip case; `err` key for errors (invariant 20).
- **i18n:** all strings via `useTranslations()` in every locale file
  (`flows.actions.moreOptions`, `flows.actions.findPlacesNearMe`, the note,
  the warning, "All locations").
- **Tests:** graph-walk helper (branches, cycles, bot-field exclusion,
  multiple sources), source selection, nearest query precision, handler skip
  matrix, menu test.

## What's left to the builder

Icons, exact key/field names, component layout, where the graph helper
lives, test placement per AGENTS.md, tie-break order.
