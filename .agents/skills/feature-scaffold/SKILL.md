---
name: feature-scaffold
description: >-
  Scaffold new features following project conventions for the builder app.
  Use when creating a new feature, page, component, server action, query,
  or adding a new section to the web application.
---

# Feature Scaffold

## Feature Directory Structure

Features live in `apps/builder/src/features/<feature-name>/`. Standard layout:

```
features/<feature-name>/
  actions/              → Server actions (next-safe-action)
    create-item-action.ts
    delete-item-action.ts
  api/                  → oRPC route handlers
    index.ts
    private.ts
    workspace-token.ts
  queries/              → Request adapters over business services
    index.ts
  schema/               → Zod schemas
    query.ts            → List/filter params
    action.ts           → Mutation inputs
    resource.ts         → Response shapes
  provider/             → Zustand store + context (client-only state, if needed)
    item-store.ts
    item-store-provider.tsx
  components/           → UI components (if many)
  hooks/                → Feature-specific hooks (if needed);
                          use-<items>.ts → TanStack Query hooks for server lists
  item-table.tsx        → Root-level components (if few)
  create-item-dialog.tsx
```

Not every feature needs all directories. Use what's appropriate.

Never add a `server/` directory — it is not a recognized layout and every
prior instance of one was a de-facto ad-hoc business layer with `db` access
straight from `apps/builder`. Data access and side effects belong in
`packages/business` (service), which may call `packages/database/src/repositories`
(repository) itself; logic that only builder can see (e.g. it depends on
`profileFetcherFactories` or another builder-only registry) goes in
`features/<feature>/lib/*.ts` or `features/<feature>/queries/*.ts` instead,
never `"use server"`.

A `queries/*.ts` file is a **thin request adapter**, not a place to write
business logic — see the "Queries (Server-Side)" section below.

## Page Pattern (Server Component)

```typescript
// app/space/[workspaceId]/(has-folder)/<feature>/page.tsx
import { Suspense } from "react"
import { getIdFromParams } from "@chatbotx.io/utils"
import { listItems } from "@/features/<feature>/queries"
import { ItemsTable } from "@/features/<feature>/items-table"

export default async function ItemsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  const searchParams = await props.searchParams
  const search = listItemsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listItems({ ...search, workspaceId }),
  ])

  return (
    <Suspense>
      <ItemsTable promises={promises} workspaceId={workspaceId} />
    </Suspense>
  )
}
```

### Key Page Patterns

- Pages are **async server components** (no `"use client"`)
- `params` and `searchParams` are `Promise<...>` (Next.js 15+ style)
- Use `getIdFromParams()` to extract and validate IDs
- Pass `Promise.all([...])` as `promises` prop to client components
- Client components unwrap with `React.use(promises)`
- URL state via **nuqs** (`listItemsSearchParamsCache.parse()`)

### Public routes (short links, webhooks, open redirects)

Some features expose **unauthenticated** URLs (tracking links, asset callbacks, etc.):

- Implement the handler as a **Route Handler** under `apps/builder/src/app/<public-prefix>/.../route.ts` (or `page.tsx` when appropriate).
- Add the URL prefix to `publicRoutes` in `apps/builder/src/proxy.ts` so the middleware does not force sign-in for those paths.
- Put redirect rules, URL templating, and validation in a small `lib/*` module when the same logic might be reused or tested.
- Register new **Tools** entries in `apps/builder/src/features/tools/tools-list.tsx` (with `getLink`) and add **i18n** keys under `apps/builder/messages/*.json`.

## Client Component Pattern

```typescript
"use client"

import { use } from "react"

type Props = {
  promises: Promise<[ItemList]>
  workspaceId: string
}

export const ItemsTable = ({ promises, workspaceId }: Props) => {
  const [items] = use(promises)

  return (
    // Table UI using @chatbotx.io/ui components
  )
}
```

## Server Actions

Use `next-safe-action` with workspace-scoped client:

```typescript
// actions/create-item-action.ts
"use server"

import { workspaceActionClient } from "@/lib/safe-action"
import { createItemRequest } from "../schema/action"

export const createItemAction = workspaceActionClient
  .bindArgsSchemas([z.string()]) // workspaceId
  .inputSchema(createItemRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }) => {
      return await createItem({ workspaceId, ...parsedInput })
    },
  )
```

## Tests

- Put builder app-level tests for actions, routes, API behavior, cache behavior,
  or cross-feature behavior in `apps/builder/__tests__/`.
- Use colocated `src/features/**/__tests__` only for narrow component/unit tests
  that are clearly owned by that feature.

### Action Clients

All six live in `apps/builder/src/lib/safe-action.ts`. Default to the most restrictive one
that fits (fail closed):

| Client | Gate |
|---|---|
| `workspaceActionClient` (`:141`) | workspace membership **+** trial-expiry gate — the default for feature actions |
| `workspaceActionClientAllowExpired` (`:96`) | membership, **skips** the expiry gate. Only for delete/disconnect/cancel that must stay available post-expiry (repo invariant 14) |
| `workspaceActionClientAllowScheduledDeletion` (`:174`) | membership, tolerates a workspace inside its soft-delete grace window |
| `superAdminActionClient` (`:89`) | authenticated **+** super admin |
| `platformAdminActionClient` (`:80`) | authenticated **+** platform admin |
| `authActionClient` (`:43`) | authenticated session only — no workspace scope |

## Queries (Server-Side)

**Rule:** The chain is `action | API handler → service → repository → DB`.
Queries must NOT import `db` or `@chatbotx.io/database/schema` directly — call
a service from `@chatbotx.io/business`. Neither module is importable from
`apps/builder/src/features/*/queries/*.ts`. See `.agents/rules/data-access.md`
for the full contract.

A query file's job is narrow: turn session context into plain params, call
the service, shape the response. It holds no where-builders, pagination, or
count logic — that lives in the service (or the repository behind it).

### No session context needed → skip the query file

If a query would do nothing but forward its arguments to a service, don't
write the file — call the service directly from the caller:

```typescript
// No query file needed — tagService.list needs nothing from the session.
import { tagService } from "@chatbotx.io/business"

const { data } = await tagService.list({ workspaceId })
```

### Session context needed → a thin adapter

```typescript
// queries/get-contact.query.ts
import { contactService } from "@chatbotx.io/business"
import { requireContactPermissionScope } from "../permissions"

export async function getContact(input: { workspaceId: string; id: string }) {
  const accessScope = await requireContactPermissionScope(input.workspaceId)
  return await contactService.findDetailOrFail({
    workspaceId: input.workspaceId,
    id: input.id,
    accessScope,
  })
}

// RSC wrapper with auth check
export const listItemsRSC = async (params: ListItemsParams) => {
  await assertCurrentUserCanAccessChatbot(params.workspaceId)
  return listItems(params)
}
```

## Forms

Use React Hook Form + Zod + next-safe-action adapter:

```typescript
"use client"

import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { zodResolver } from "@hookform/resolvers/zod"
import { createItemAction } from "../actions/create-item-action"
import { createItemRequest } from "../schema/action"

export const CreateItemForm = ({ workspaceId }: { workspaceId: string }) => {
  const { form, handleSubmitWithAction } = useHookFormAction(
    createItemAction.bind(null, workspaceId),
    zodResolver(createItemRequest),
    { formProps: { defaultValues: { name: "" } } },
  )

  return (
    <form onSubmit={handleSubmitWithAction}>
      {/* Form fields using @chatbotx.io/ui form components */}
    </form>
  )
}
```

### Form field component priority

Always pick the highest-priority option that fits the field type:

1. **Defined form field** from `@chatbotx.io/ui/components/form/*` — **first choice**.
   Handles label, optional marker, description, and `FormMessage` automatically.
2. **Shadcn UI primitive** from `@chatbotx.io/ui/components/ui/*` inside a manual
   `FormField`/`FormItem` block — only when no defined field covers the use case.
3. **Raw React/HTML element** — last resort.

Available defined fields:

| Component | Import path | Use for |
|---|---|---|
| `InputField` | `form/input-field` | Text inputs |
| `InputNumberField` | `form/input-number-field` | Numeric inputs (stepper UI) |
| `TextareaField` | `form/textarea-field` | Multi-line text |
| `SelectField` | `form/select-field` | Dropdowns; supports `allowClear`, `options` |
| `ComboboxField` | `form/combobox-field` | Searchable single-select |
| `MultiSelectField` | `form/multi-select-field` | Multi-select |
| `CheckboxField` | `form/checkbox-field` | Boolean checkbox |
| `SwitchField` | `form/switch-field` | Toggle switch |
| `RadioGroupField` | `form/radio-group-field` | Radio group |
| `SliderField` | `form/slider-field` | Range slider |
| `DatePickerField` | `form/date-picker-field` | Date picker popover |
| `ColorPickerField` | `form/color-picker-field` | Color picker |

All defined fields read `control` from `useFormContext` — no `control` prop
needed as long as a `<Form {...form}>` provider wraps the form.

### Use the shared components, never raw HTML

- **Sections:** group multi-section forms with `<Card>` / `<CardHeader>` / `<CardTitle>` /
  `<CardContent className="space-y-4">` (`@chatbotx.io/ui/components/ui/card`). Never a plain
  `<div className="rounded-lg border p-6">`.
- **Buttons:** always `<Button>` (`@chatbotx.io/ui/components/ui/button`) — including icon-only
  buttons and ones inside a base-ui trigger's `render` prop. Never a raw `<button>`. Use the
  `variant` prop (`ghost`, `outline`, `dashed`, …) rather than re-styling with `className`.
- **Sticky save bars, empty states, and table shells** already exist in `@chatbotx.io/ui` and in
  sibling features — copy the nearest real page rather than rebuilding the markup.

For the full component ladder (which field component to reach for first) see the
**`builder-ui-i18n`** skill.

### CRITICAL — Default Values for Nullable Text Fields

React Hook Form requires non-null values for controlled text inputs. Passing `null` as a `defaultValues` entry causes React to treat the input as **uncontrolled**, triggering warnings and unpredictable behavior.

**Rule:** Always use `""` (empty string) for optional/nullable text field defaults. Never use `null` or `undefined`.

When the DB field is nullable, add a `z.preprocess` step to the Zod schema so the form sends `""` while the server action still receives `null`:

```typescript
// schema/action.ts — convert "" → null before validation
export const createItemSchema = z.object({
  name: z.string().trim().min(1),
  // CORRECT: preprocess empty string to null for nullable DB fields
  icon: z.preprocess(
    (val) => (val === "" ? null : val),
    z.string().trim().nullable().default(null),
  ),
})
```

```typescript
// In defaultValues — use "" not null
const form = useForm<z.input<typeof createItemSchema>>({
  resolver: zodResolver(createItemSchema),
  defaultValues: { name: "", icon: "" }, // CORRECT
  // defaultValues: { name: "", icon: null }, // WRONG — uncontrolled input
})

// When seeding from existing DB data (edit forms), coerce null → ""
defaultValues={{
  name: item.name,
  icon: item.icon ?? "", // CORRECT — null from DB → "" for the form
}}
```

### Watching Form Values — Use `useWatch`

To reactively read form field values in render, use `useWatch` from `react-hook-form` instead of `form.watch()`. `useWatch` is a proper React hook and avoids unnecessary re-renders of parent components.

```typescript
import { useWatch } from "react-hook-form"

// WRONG — causes parent re-renders
const inventoryPolicy = form.watch("inventoryPolicy")

// CORRECT — scoped subscription
const inventoryPolicy = useWatch({ control: form.control, name: "inventoryPolicy" })
const longDescription = useWatch({ control: form.control, name: "longDescription" }) ?? ""
```

### CRITICAL — `.bind()` for actions with `bindArgsSchemas`

When an action uses `bindArgsSchemas` (e.g. for workspaceId), you **MUST** call `.bind(null, workspaceId)` before passing to `useHookFormAction`. Without `.bind()`, TypeScript will error: "Target signature provides too few arguments."

```typescript
// WRONG — will cause type error
useHookFormAction(createItemAction, zodResolver(schema), ...)

// CORRECT — bind the workspaceId first
useHookFormAction(createItemAction.bind(null, workspaceId), zodResolver(schema), ...)
```

Similarly for `useAction` with delete actions:
```typescript
const { execute } = useAction(
  deleteItemAction.bind(null, workspaceId, itemId),
  { onSuccess: ..., onError: ... },
)
// Call execute() with NO arguments (not execute({}))
execute()
```

## Server data (TanStack Query)

Fetched lists/detail reads (anything backed by an oRPC procedure) go through
TanStack Query, not a zustand store. See `orpc-api` skill's "React components
(TanStack Query)" subsection for the client-side call pattern. Shape
(`features/ai-agents/hooks/use-ai-agents.ts` is the reference implementation):

```typescript
// hooks/use-items.ts
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

export const useItems = (workspaceId: string | undefined) =>
  useQuery(
    orpc.<router>.<listProcedure>.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId),
      select: (res) => res.data,
    }),
  )

/** Call after create/update/delete so every reader refetches. */
export const useInvalidateItems = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: orpc.<router>.key() })
}
```

Use `useWorkspaceId()` (`@/hooks/routing`) to scope the query to the current
workspace. Never put a fetched list, `loading`, or `error` in a zustand store —
TanStack Query already dedupes concurrent reads app-wide, caches per query key,
and lets any mutation invalidate every reader.

TanStack Query is the **only** client data-fetching layer — `lib/swr.ts` and
the `swr` package were removed once every `useClientQuery`/`useSWR*` consumer
was migrated. For less common shapes, reuse the shared helpers instead of
hand-rolling them again:

- **Search-as-you-type**: pass `placeholderData: keepPreviousData` (import the
  *function* from `@tanstack/react-query`, not `true`) plus
  `refetchOnWindowFocus: false` so the previous results stay on screen while a
  new keyword is in flight (`meta-catalog-product-select.tsx`).
- **Polling until a job settles** (export files, async worker results):
  `@/lib/query/poll-until-settled`'s `pollUntilSettled(settledStatuses)`
  returns a `refetchInterval` callback — TanStack passes it the `Query` (not
  the data), so it reads `query.state.data?.status`.
- **Fetching every page of a paginated list upfront** (not
  `useInfiniteQuery`'s incremental `fetchNextPage`):
  `@/lib/query/fetch-all-pages`'s `fetchAllPages({ fetchPage, initialPageParam,
  maxPages })` loops and flattens every page in one `queryFn`.

## Client-only state (Zustand)

For features needing client-only state (selection, open/closed dialogs,
in-progress form state — never a fetched list):

```typescript
// provider/item-store.ts
import { createStore } from "zustand/vanilla"

type ItemState = {
  selectedId: string | null
}

type ItemActions = {
  setSelectedId: (id: string | null) => void
}

export type ItemStore = ItemState & ItemActions

export const createItemStore = (initial: Partial<ItemState> = {}) =>
  createStore<ItemStore>((set) => ({
    selectedId: null,
    ...initial,
    setSelectedId: (id) => set({ selectedId: id }),
  }))
```

Wrap with React context provider (`provider/item-store-provider.tsx`).

## Import Conventions

| What | Path |
|------|------|
| App internal | `@/features/<feature>/...`, `@/lib/...`, `@/components/...` |
| Shared UI | `@chatbotx.io/ui/components/ui/<component>` (via the package's `exports` map) |
| Business services | `@chatbotx.io/business` — the only way to reach data from a feature |
| Types | `@chatbotx.io/database/types` |
| Shared helpers | `@chatbotx.io/utils` (`getIdFromParams`, `zodBigintAsString`, …) |
| oRPC client | `@/lib/orpc/orpc` |
| oRPC stacks | `@/orpc` (for `authorizedAPI`, `workspaceTokenAuthAPIForScope`) |
| Auth middleware | `@/middlewares/auth` |
| Safe action clients | `@/lib/safe-action` |

`@chatbotx.io/database/client` and `@chatbotx.io/database/schema` are **not**
importable from `apps/builder/src/features/*` — see `.agents/rules/data-access.md`.

## Layout Patterns

- **Route groups** `()` organize without URL segments: `(settings)`, `(has-folder)`, `(ai)`
- **Parallel routes** `@slot` for multi-panel layouts (e.g. the `@folders` sidebars under `(has-folder)`)
- **Route-driven accordions** for the channels/integrations settings lists: each row is a real nested route (`settings/channels/<channel>`, `settings/integrations/<slug>`) rendered through the shared `RouteAccordionShell` (`@/components/route-accordion-shell`) with `prefetch={false}`, so only the active row's server/client graph loads — do NOT convert these back to slots or eager panels
- **Workspace layout** at `space/[workspaceId]/layout.tsx`: auth, sidebar, workspace context
- Server layouts: auth checks, data loading
- Client layouts: tabs, accordions, interactive navigation

## Internationalization (i18n)

All user-facing text **must** use `useTranslations()` — never hardcode a label, placeholder,
button, or toast. Reuse existing `fields.*` / `actions.*` / `messages.*` keys before adding new
ones, and add every new key to **all** locale files in `apps/builder/messages/` (the parity
check in `pnpm lint` fails otherwise).

Full rules — namespaces, form-field reuse, dynamic keys, RTL — are in the **`builder-ui-i18n`**
skill. Read it for any UI work; it is not duplicated here.

## Logging

Server code (actions, queries, API handlers) uses the structured logger, never `console`:
`const logger = baseLogger.child({ feature: "myFeature" })` from `@chatbotx.io/logger`, then
`logger.error({ err: error }, "[myFeature] operation failed")`. **The key is `err`, not `error`** —
see repo invariant 20 in `AGENTS.md`.

## Services — business logic lives in `@chatbotx.io/business`

**Never** create a `*.service.ts` inside a feature folder. Business logic (DB queries, domain
mutations, cache invalidation, events) belongs in `packages/business/src/<domain>/service.ts`;
a feature imports it: `import { integrationService } from "@chatbotx.io/business"`. If a
legacy service already sits in a feature folder, move it before extending it.

A feature folder holds only `actions/`, `api/`, `queries/`, `schema/`, `components/`, `hooks/`,
`provider/` — see the directory structure at the top of this file.

Service/repository layering, the `.query.ts` contract, and the shared-service rule for
public vs private paths: **`business-data-access`** skill and `.agents/rules/data-access.md`.

## Checklist for New Feature

1. Create feature directory under `src/features/<name>/`
2. Define Zod schemas in `schema/`
3. Add or extend the service method in `packages/business` first — the query/action file only adapts to it
4. Create request adapters in `queries/` (only where session context needs adapting — see "Queries (Server-Side)" above)
5. Add server actions in `actions/` (if mutations needed)
6. Create oRPC API in `api/` (if API access needed)
7. Register router in `src/routers/index.ts` as a `lazy()` branch (see the orpc-api skill — every feature router there is lazy so the route handler stays small)
8. Create page(s) under `src/app/space/[workspaceId]/...`
9. Build UI components (server page → client table/form)
10. **Add i18n translations** to `apps/builder/messages/en.json` — reuse `fields.*` for form labels, add feature-specific text under `<featureName>.*`
11. **Verify no hardcoded strings** — all user-facing text uses `useTranslations()` + `t()`
