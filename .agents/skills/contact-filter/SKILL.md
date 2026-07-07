---
name: contact-filter
description: >-
  Work with the ChatbotX contact filter system — the shared filter model behind
  the contacts list, conversations, and broadcast audiences. Use when adding a
  filter field or operator, changing the filter UI, editing the SQL query
  builder, or enforcing an audience constraint. Covers the definitions
  single-source, the two operator-rule sources that must stay in sync, NULL /
  negation three-valued logic, relation EXISTS subqueries, and the excludeFields
  mechanism.
---

# Contact Filter

A reusable, structured filter (`{ operator, conditions[] }`) applied to contacts.
Lives in two packages:

- **Frontend feature** — `apps/builder/src/features/contact-filter/` (Zod schemas,
  UI config, React components). Barrel: `index.ts`.
- **Backend query builder** — `packages/database/src/queries/contact-filter.ts`
  (`@chatbotx.io/database/queries`). Shared by the builder app **and** the worker
  so both resolve the same contacts.

## Architecture

```
contactFilterFields enum (partials/contact.ts)     ← the field "universe" (~90)
        │
CONTACT_FILTER_FIELD_DEFINITIONS (schemas/definitions.ts)  ← 22 ACTIVE fields = single source of truth
        │  (each: { field, schemaKind, optionSource })
        ├──► Zod condition schemas  (schemas/*.ts, via staticFieldFilter)
        └──► UI FieldConfig[]        (components/contact-filter-config.ts, getFieldConfigs)

Filter object → API `contactFilter` param → buildContactWhere / buildContactInboxContactFilterSQL
             → applyContactFilter → buildConditionWhere (switch per field) → Drizzle where / SQL
```

**Filter shape** (`schemas/index.ts`):

```ts
contactFilterCriteriaSchema = { operator: "and" | "or", conditions: ContactFilterCondition[] }
// condition (static):  { field, operator, value? }
// condition (boolean): { field, operator: "eq", value: "true"|"false" }  |  { field, operator: "isEmpty" }
// condition (custom):  { field: "customField", customFieldId, valueType, operator, value? }
```
`operator` is **top-level only** — the schema is **flat, no nested groups**.
Operators + form-field types: `packages/database/src/partials/custom-field.ts`
(`operatorTypes`, `FormFieldType`).

## Adding a new filter field

1. **Enum** — add the field key to `contactFilterFields` in
   `packages/database/src/partials/contact.ts`.
2. **Definition** — add one entry to `CONTACT_FILTER_FIELD_DEFINITIONS`
   (`schemas/definitions.ts`) with `schemaKind`
   (`boolean|text|multiSelect|select|datetime|number`) and `optionSource`
   (`none|languages|countries|continents|gender|contactSources|channels|inboxes|tags|flows`).
   This one entry auto-generates **both** the Zod condition schema and the UI config.
3. **Operator rules — TWO places (CRITICAL, must match):**
   - Zod validation: `STATIC_OPERATOR_RULES` in `schemas/static-field-filter.ts`
   - UI enablement: `staticFieldRules` in `components/static-field-filter-config.ts`
4. **Backend SQL** — add a `case` to `buildConditionWhere`
   (`packages/database/src/queries/contact-filter.ts`). Without it the field
   silently produces **no condition** (the `default: return {}` branch).
5. **Options / group** (if not `none`) — wire the option source in
   `use-contact-filter-configs.ts` / `contact-filter-config.ts`; group is assigned
   by `getContactFilterFieldGroup`.

## Backend query builder (`packages/database/src/queries/contact-filter.ts`)

- `applyContactFilter(criteria)` → maps `conditions` to `{ AND: [...] }` or
  `{ OR: [...] }`; `buildConditionWhere(condition)` switches on `field`.
- `buildContactWhere({ workspaceId, keyword?, contactFilter? })` → relational
  where for `contactModel`.
- `buildContactInboxContactFilterSQL({ contactIdColumn, workspaceId, contactFilter })`
  → `contactId IN (SELECT id FROM Contact WHERE …)` for ContactInbox-rooted queries.
- `ContactFilterCriteriaInput.conditions` is `unknown[]` on purpose — the DB
  package can't import the builder's Zod schema; each entry is Zod-validated at
  the request boundary, then narrowed here.

## CRITICAL invariants

- **Two operator-rule sources must stay in sync** — `STATIC_OPERATOR_RULES` (Zod)
  and `staticFieldRules` (UI). Editing one without the other lets the UI offer an
  operator Zod rejects, or vice-versa.
- **NULL / negation three-valued logic** — negative and "is empty" operators must
  also match rows where the value is NULL/absent (SQL `NOT (x = y)` drops NULLs).
  Preserve these:
  - `COLUMN_NEGATION_OPERATORS` (`ne`, `notIn`, `notContains`) ⇒
    `{ OR: [condition, { [col]: { isNull: true } }] }`.
  - date `ne` ⇒ `(col < dayStart OR col >= dayEnd OR col IS NULL)`.
  - relation `isEmpty` ⇒ `NOT EXISTS`; custom-field negation ⇒ `NEGATION_TO_POSITIVE`
    + negated EXISTS.
  (This is the fix behind commit *"correct contact filter results for negative and
  empty conditions"* — do not regress it.)
- **Relation fields render as correlated `RAW` EXISTS** — `tags`, `source`,
  `currentChannel`, `inbox` go through `RELATION_SET_FILTERS` + `buildRelationSetWhere`.
  `relationsFilterToSQL` does **not** understand nested relation filter fields, so
  relation conditions must be `RAW` EXISTS subqueries correlated on the contact id.
- **No forced/default-condition injection** — there is no mechanism to seed a
  hidden condition into a user's filter. Because the schema is flat (no nested
  groups), injecting a forced condition would force resolving AND-vs-OR against the
  user's own `operator`. **Enforce cross-cutting audience constraints in the
  backend query instead**, keyed off context — e.g. the broadcast 24h messaging
  window keys off `broadcast.subaction` in the worker (see below), never a filter
  param.

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

`contactInboxInteractedWithin24hSQL()` (in `contact-filter.ts`) is the single
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

## Common mistakes

- Adding a field to `CONTACT_FILTER_FIELD_DEFINITIONS` but not implementing its
  `buildConditionWhere` case → filter silently no-ops.
- Updating operators in only one of the two rule sources.
- Writing a negative/empty operator that drops NULL rows (breaks three-valued logic).
- Trying to inject a forced/default condition into the flat schema — put the
  constraint in the query instead.
- Expecting nested `(A OR B) AND C` — not supported; `operator` is top-level only.

## Checklist for a filter change

- [ ] Field key in `contactFilterFields` enum
- [ ] Entry in `CONTACT_FILTER_FIELD_DEFINITIONS`
- [ ] Operator rules updated in **both** `STATIC_OPERATOR_RULES` and `staticFieldRules`
- [ ] `buildConditionWhere` case implemented (with NULL/negation handling)
- [ ] Option source + group wired (if `optionSource !== "none"`)
- [ ] Tests: `apps/builder/__tests__/contact-filter-*.test.ts` and
      `packages/database/__tests__/contact-filter.test.ts`
- [ ] `pnpm lint` + `check-types` for `builder` and `@chatbotx.io/database`
