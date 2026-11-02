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

A reusable, structured filter (`{ operator, conditions[] }`, flat, `operator` top-level only)
applied to contacts. Frontend: `apps/builder/src/features/contact-filter/`. Backend query
builder: `packages/database/src/queries/contact-filter/` (`@chatbotx.io/database/queries`),
shared by the builder and the worker. Fields are defined once in
`CONTACT_FILTER_FIELD_DEFINITIONS` (`schema/definitions.ts`), which generates both the Zod
condition schema and the UI config. Operator rules live in two places that must stay in sync.

## Adding a new filter field

1. **Enum** — add the field key to `contactFilterFields` in
   `packages/database/src/partials/contact.ts`.
2. **Definition** — add one entry to `CONTACT_FILTER_FIELD_DEFINITIONS`
   (`schema/definitions.ts`) with `schemaKind`
   (`boolean|text|multiSelect|select|datetime|number`) and `optionSource`
   (`none|languages|countries|continents|gender|contactSources|channels|inboxes|tags|flows`).
   This one entry auto-generates **both** the Zod condition schema and the UI config.
3. **Operator rules — TWO places (CRITICAL, must match):**
   - Zod validation: `STATIC_OPERATOR_RULES` in `schema/static-field-filter.ts`
   - UI enablement: `staticFieldRules` in `components/static-field-filter-config.ts`
4. **Backend SQL** — add a `case` to `buildConditionWhere`
   (`packages/database/src/queries/contact-filter/index.ts:412`; it takes
   `(condition, context)`). Without it the field silently produces **no condition**
   (the `default: return {}` branch).
5. **Options / group** (if not `none`) — wire the option source in
   `use-contact-filter-configs.ts` / `contact-filter-config.ts`; group is assigned
   by `getContactFilterFieldGroup`.

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
- **`excludeFields` is UI hiding only** — `ContactFilter` / `ContactFilterDialog` /
  `ContactListFilterPanel` take `excludeFields?: ContactFilterField[]`, which hides the field
  and prunes existing conditions (`pruneExcludedConditions`). For enforcement (runtime-only
  fields) use `surfaces: ["flowCondition"]` instead; broadcast constraints live in the
  backend query.

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
- [ ] If the option source's values are workspace entity ids, register it in `FILTER_VALUE_LABEL_SOURCES` (`lib/filter-value-labels.ts`) and the id lookup (`resolveContactFilterValueLabels`) so read-only labels show names / "Unknown" instead of raw ids
- [ ] Tests: `apps/builder/__tests__/contact-filter-*.test.ts` and
      `packages/database/__tests__/contact-filter.test.ts`
- [ ] `pnpm lint` + `check-types` for `builder` and `@chatbotx.io/database`

## References

- [references/architecture-and-file-map.md](references/architecture-and-file-map.md) — read for the field pipeline diagram, filter shape, backend file map with line anchors, `applyContactFilter`/`buildContactWhere` details, and where filters are applied for lists.
- [references/activity-and-pipeline-filters.md](references/activity-and-pipeline-filters.md) — read when touching activity-backed fields (Executed Flow, Keywords, emails, ads) or the `pipelineItem` filter.
- [references/surfaces-and-audience.md](references/surfaces-and-audience.md) — read for `surfaces`, `excludeFields` details, the broadcast policy, the shared 24h window predicate, and consumers.
