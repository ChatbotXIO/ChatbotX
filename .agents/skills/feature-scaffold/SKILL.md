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
    authenticated.ts
    workspace-token.ts
  queries/              → Server-side DB queries
    index.ts
  schema/               → Zod schemas
    query.ts            → List/filter params
    action.ts           → Mutation inputs
    resource.ts         → Response shapes
  provider/             → Zustand store + context (if needed)
    item-store.ts
    item-store-provider.tsx
  components/           → UI components (if many)
  hooks/                → Feature-specific hooks (if needed)
  item-table.tsx        → Root-level components (if few)
  create-item-dialog.tsx
```

Not every feature needs all directories. Use what's appropriate.

## Page Pattern (Server Component)

```typescript
// app/space/[workspaceId]/(has-folder)/<feature>/page.tsx
import { Suspense } from "react"
import { getIdFromParams } from "@/lib/params"
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

### Action Clients

- `workspaceActionClient` — requires workspace membership
- `authActionClient` — requires authenticated session only

## Queries (Server-Side)

```typescript
// queries/index.ts
import { db } from "@chatbotx.io/database/client"

export const listItems = async (params: ListItemsParams) => {
  return db.query.myModel.findMany({
    where: { workspaceId: params.workspaceId },
    with: { tags: true },
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

## State Management (Zustand)

For features needing client-side state:

```typescript
// provider/item-store.ts
import { createStore } from "zustand/vanilla"

type ItemState = {
  items: Item[]
  selectedId: string | null
}

type ItemActions = {
  setSelectedId: (id: string | null) => void
}

export type ItemStore = ItemState & ItemActions

export const createItemStore = (initial: Partial<ItemState> = {}) =>
  createStore<ItemStore>((set) => ({
    items: [],
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
| Shared UI | `@chatbotx.io/ui/<component>` |
| Database | `@chatbotx.io/database/client`, `@chatbotx.io/database/schema` |
| Types | `@chatbotx.io/database/types` |
| oRPC client | `@/lib/orpc/orpc` |
| oRPC stacks | `@/orpc` (for `authorizedAPI`, `workspaceTokenAuthAPI`) |
| Auth middleware | `@/middlewares/auth` |
| Safe action clients | `@/lib/safe-action` |

## Layout Patterns

- **Route groups** `()` organize without URL segments: `(settings)`, `(has-folder)`, `(ai)`
- **Parallel routes** `@slot` for multi-panel layouts (e.g. channels settings)
- **Workspace layout** at `space/[workspaceId]/layout.tsx`: auth, sidebar, workspace context
- Server layouts: auth checks, data loading
- Client layouts: tabs, accordions, interactive navigation

## Internationalization (i18n) — next-intl

All user-facing text **MUST** be internationalized using `next-intl`. Never hardcode labels, placeholders, messages, or button text.

### Setup

```typescript
import { useTranslations } from "next-intl"

const t = useTranslations()
```

### Translation File Structure

Translations live in `apps/builder/messages/en.json`. The file is organized into namespaces:

| Namespace | Purpose | Example |
|-----------|---------|---------|
| `fields.*` | Reusable field labels, placeholders, descriptions | `fields.name.label`, `fields.email.placeholder` |
| `actions.*` | Button/action labels | `actions.cancel`, `actions.create`, `actions.save` |
| `messages.*` | Toast messages, confirmations, descriptions | `messages.createdSuccess`, `messages.deleteConfirmation` |
| `<feature>.*` | Feature-specific text (titles, descriptions, unique labels) | `smtp.setting.label`, `webchat.title` |

### Form Fields — Reuse `fields.*` Definitions

Form field `label` and `placeholder` props **MUST** use translations from the `fields` namespace in `en.json`. This ensures consistency across the entire app.

**Pattern:**
```typescript
<InputField
  label={t("fields.name.label")}
  name="name"
  placeholder={t("fields.name.placeholder")}
  required
/>

<SelectField
  label={t("fields.type.label")}
  name="type"
  options={options}
  required
/>
```

**Reusable fields already defined** (check `en.json` → `fields` before creating new ones):
- `fields.name` — Name
- `fields.email` — Email
- `fields.password` — Password
- `fields.description` — Description
- `fields.type` — Type
- `fields.url` — URL
- `fields.status` — Status
- `fields.provider` — Provider
- `fields.host` — Host
- `fields.port` — Port
- `fields.username` — Username
- `fields.fromAddress` — From Address
- ... and many more (always check `en.json` first)

**Adding new field definitions** — When a field doesn't exist in `en.json`, add it to the `fields` object:
```json
{
  "fields": {
    "myNewField": {
      "label": "My New Field",
      "placeholder": "Enter value"
    }
  }
}
```

Each field entry can have: `label` (required), `placeholder` (optional), `description` (optional).

### CRITICAL — Never Hardcode Labels in Forms

```typescript
// WRONG — hardcoded label strings
<InputField label="Username" name="username" placeholder="user@example.com" />
<InputField label="Password" name="password" />

// CORRECT — use t() with fields namespace
<InputField
  label={t("fields.username.label")}
  name="username"
  placeholder={t("fields.username.placeholder")}
/>
<InputField
  label={t("fields.password.label")}
  name="password"
/>
```

### Actions (Buttons)

Use `actions.*` for all button labels:

```typescript
<Button onClick={onCancel} type="button" variant="ghost">
  {t("actions.cancel")}
</Button>
<Button type="submit">
  {t("actions.create")}
</Button>
```

Common actions: `actions.cancel`, `actions.create`, `actions.save`, `actions.delete`, `actions.update`, `actions.confirm`, `actions.connect`, `actions.disconnect`.

Parametric actions with `{feature}` interpolation:
```typescript
t("actions.createFeature", { feature: t("fields.sequences.label") })
t("actions.connectFeature", { feature: "WhatsApp" })
```

### Toast Messages

Use `messages.*` with `{feature}` interpolation:

```typescript
// Success
toast.success(t("messages.createdSuccess", { feature: "SMTP" }))
toast.success(t("messages.updatedSuccess", { feature: t("fields.webhook.label") }))

// Error — prefer translated messages, fallback to serverError
toast.error(error.serverError || t("messages.unknownError"))
```

### Feature-Specific Translations

For text unique to a feature (not reusable), add a feature namespace:

```json
{
  "smtp": {
    "setting": {
      "description": "Send emails using your SMTP server.",
      "label": "(Email) SMTP"
    }
  }
}
```

Access: `t("smtp.setting.label")`, `t("smtp.setting.description")`

### Dialog / Confirmation Text

Use `messages.*`:
```typescript
t("messages.deleteConfirmation", { feature: "contact" })
t("messages.disconnectFeatureDescription", { feature: "SMTP" })
```

### i18n Checklist

Before submitting any feature:
1. **No hardcoded user-facing strings** — every label, placeholder, button, message uses `t()`
2. **Reuse `fields.*`** — check existing field definitions before creating new ones
3. **Add missing translations** — if a field key doesn't exist in `en.json`, add it
4. **Use interpolation** — for dynamic text, use `{feature}`, `{name}` params
5. **Feature namespace** — feature-specific text goes under `<featureName>.*`

## Checklist for New Feature

1. Create feature directory under `src/features/<name>/`
2. Define Zod schemas in `schema/`
3. Create DB queries in `queries/`
4. Add server actions in `actions/` (if mutations needed)
5. Create oRPC API in `api/` (if API access needed)
6. Register router in `src/routers/index.ts`
7. Create page(s) under `src/app/space/[workspaceId]/...`
8. Build UI components (server page → client table/form)
9. **Add i18n translations** to `apps/builder/messages/en.json` — reuse `fields.*` for form labels, add feature-specific text under `<featureName>.*`
10. **Verify no hardcoded strings** — all user-facing text uses `useTranslations()` + `t()`
