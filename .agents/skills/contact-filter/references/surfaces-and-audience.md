# Contact filter: surfaces, excludeFields, 24h window, consumers

## Surface-limited fields — `surfaces`

A definition may set `surfaces: ["flowCondition"]` to make a field runtime-only
(e.g. `isWithinWorkingHours`, which reads `now()`). `contactFilterCriteriaSchema`
(contacts, conversations, broadcasts and their public APIs) is built from the
`contacts` surface and rejects such a field; `flowConditionFilterCriteriaSchema`
(flow Condition editor) accepts it. The pickers take a `surface` prop
(`ContactFilter` → `useContactFilterConfigs` → `getFieldConfigs`) and the
discovery endpoint a `surface` input. This is enforcement, not just hiding —
use `excludeFields` only for UI hiding.

## Hiding fields per context — `excludeFields`

`ContactFilter` / `ContactFilterDialog` / `ContactListFilterPanel` accept
`excludeFields?: ContactFilterField[]`. It removes the field from the "add
condition" list **and** prunes any existing condition referencing it
(`lib/prune-conditions.ts` → `pruneExcludedConditions`, run in a `useEffect`).

Broadcast policy example — `apps/builder/src/features/broadcasts/lib/broadcast-filter-fields.ts`:
`getBroadcastExcludedFilterFields({ channel, subaction })` hides `currentChannel`
(+`inbox` for template sends, +`interactedInLast24h` for the two non-template
Messenger/WhatsApp subactions).

## Shared 24h window predicate

`contactInboxInteractedWithin24hSQL()` (`contact-filter/predicates.ts:27`) is the single
source for `lastIncomingMessageAt >= NOW() - INTERVAL '24 hours'`, used by:
- the `interactedInLast24h` filter case (wrapped in a contact-level EXISTS), and
- the broadcast audience (`apps/worker/src/schedule/handlers/prepare-broadcast.ts`)
  + receiver-count preview (`countContactInboxes`), gated by
  `requiresRecentInteractionWindow(subaction)` (`partials/broadcast.ts`).

## Consumers

- **Contacts list** — `apps/builder/src/features/contacts/` (count via
  `countContactInboxes`, list via `listContactInboxes`).
- **Conversations** — `conversations/conversation-filter.tsx` (excludes `currentChannel`).
- **Broadcast audience** — `broadcasts/create-broadcast-form.tsx` (UI + count) →
  persisted `broadcast.contactFilter` → worker `prepare-broadcast.ts`.
