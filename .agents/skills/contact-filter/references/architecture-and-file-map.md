# Contact filter: architecture, file map, query builder

A reusable, structured filter (`{ operator, conditions[] }`) applied to contacts.
Lives in two packages:

- **Frontend feature** — `apps/builder/src/features/contact-filter/` (Zod schemas,
  UI config, React components). Barrel: `index.ts`.
- **Backend query builder** — `packages/database/src/queries/contact-filter/`
  (`@chatbotx.io/database/queries`). Shared by the builder app **and** the worker
  so both resolve the same contacts. **`queries/contact-filter.ts` is now a one-line
  re-export barrel** (`export * from "./contact-filter/index"`) — the real code is the
  14-file directory beside it:

  | Concern | File |
  |---|---|
  | Per-field dispatch (`buildConditionWhere`) | `contact-filter/index.ts:412` |
  | Negation/NULL predicates, 24h window | `contact-filter/predicates.ts` (`COLUMN_NEGATION_OPERATORS:21`, `contactInboxInteractedWithin24hSQL:27`) |
  | Operator inversion map | `contact-filter/field-value-predicates.ts` (`NEGATION_TO_POSITIVE:41`) |
  | Relation EXISTS subqueries | `contact-filter/relation-sets.ts` (`RELATION_SET_FILTERS:76`, `buildRelationSetWhere:131`) |
  | Custom / bot fields, CTWA, timezone, continent | `custom-field-predicates.ts`, `bot-field-predicates.ts`, `ctwa-retarget.ts`, `timezone.ts`, `continent.ts` |

## Architecture

```
contactFilterFields enum (partials/contact.ts)     ← the field "universe" (~90)
        │
CONTACT_FILTER_FIELD_DEFINITIONS (schema/definitions.ts)  ← ~49 ACTIVE fields = single source of truth
        │  (each: { field, schemaKind, optionSource })
        ├──► Zod condition schemas  (schema/*.ts, via staticFieldFilter)
        └──► UI FieldConfig[]        (components/contact-filter-config.ts, getFieldConfigs)

Filter object → API `contactFilter` param → buildContactWhere / buildContactInboxContactFilterSQL
             → applyContactFilter → buildConditionWhere (switch per field) → Drizzle where / SQL
```

**Filter shape** (`schema/index.ts`):

```ts
contactFilterCriteriaSchema = { operator: "and" | "or", conditions: ContactFilterCondition[] }
// condition (static):  { field, operator, value? }
// condition (boolean): { field, operator: "eq", value: "true"|"false" }  |  { field, operator: "isEmpty" }
// condition (custom):  { field: "customField", customFieldId, valueType, operator, value? }
```
`operator` is **top-level only** — the schema is **flat, no nested groups**.
Operators + form-field types: `packages/database/src/partials/custom-field.ts`
(`operatorTypes`, `FormFieldType`).

## Where filter application lives

`contactRepository.buildListWhere` (aliases `buildContactListWhere`, `packages/database/src/repositories/contact/list-where.ts:42`)
is the one place `applyContactFilter` is called to build the where clause for
a contacts list/count — used by both the builder (private RSC) and the public
API, via `contactService.list`/`count` (`packages/business/src/contact/list.ts`).
`.query.ts` files never call `applyContactFilter` directly — that duplicates
the where-builder per caller, which is exactly what the service/repository
split exists to prevent (see `.agents/rules/data-access.md`). The worker's
`export-contacts.ts` still hand-builds its own where clause — a known
follow-up, not a pattern to extend.

## Backend query builder (`packages/database/src/queries/contact-filter/`)

- `applyContactFilter(criteria)` → maps `conditions` to `{ AND: [...] }` or
  `{ OR: [...] }`; `buildConditionWhere(condition, context)` switches on `field`.
- `buildContactWhere({ workspaceId, keyword?, contactFilter? })` → relational
  where for `contactModel`.
- `buildContactInboxContactFilterSQL({ contactIdColumn, workspaceId, contactFilter })`
  → `contactId IN (SELECT id FROM Contact WHERE …)` for ContactInbox-rooted queries.
- `ContactFilterCriteriaInput.conditions` is `unknown[]` on purpose — the DB
  package can't import the builder's Zod schema; each entry is Zod-validated at
  the request boundary, then narrowed here.
