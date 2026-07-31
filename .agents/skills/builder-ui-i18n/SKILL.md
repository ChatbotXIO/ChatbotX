---
name: builder-ui-i18n
description: >-
  Build or modify ChatbotX builder UI components, forms, tables, dialogs,
  shared UI usage, and translations. Use for user-facing React/Next.js UI in
  apps/builder, especially when labels, placeholders, menus, or validation
  messages are added or changed.
---

# Builder UI and i18n

Use for `apps/builder` UI work. Pair with `feature-scaffold` for new feature
modules and pages.

## UI Stack

- React 19 + Next.js app router.
- Shared components come from `@chatbotx.io/ui/*`.
- Builder also has local components under `apps/builder/src/components`.
- Forms use React Hook Form, Zod, and next-safe-action adapter.
- URL state commonly uses `nuqs`.
- Icons should use the project icon library when available.

## i18n Rule

All user-facing strings must use translations. Do not hardcode labels,
placeholders, button text, empty states, tab names, toasts, or dialog copy in
builder UI.

Primary files:

- `apps/builder/messages/en.json`
- `apps/builder/messages/vi.json`

Before adding keys, check existing `fields.*`, common actions, table labels, and
feature namespaces. Add both English and Vietnamese values for new keys.

Typical component pattern:

```typescript
"use client"

import { useTranslations } from "next-intl"

export const ExampleButton = () => {
  const t = useTranslations("features.examples")
  return <Button>{t("create")}</Button>
}
```

### Dynamic translation keys

Never pass a raw variable or an unconstrained template literal to `t()`. When a
runtime value selects a translation key, route it through an exhaustive literal
map:

```typescript
const labelKeyByStatus = {
  active: "features.examples.status.active",
  paused: "features.examples.status.paused",
} as const satisfies Record<ExampleStatus, string>

t(labelKeyByStatus[status])
```

A helper function backed by the same kind of map is also acceptable. This keeps
every possible key auditable with text search and makes TypeScript report enum
members that have no translation mapping.

If the key comes from an open-ended source such as a database string, guard the
lookup and provide a translated fallback:

```typescript
t.has(key) ? t(key) : t("features.examples.unknown")
```

`@lingual/i18n-check` also recognizes escape-hatch comments such as
`// i18n-check t('features.examples.status.active')`. Use one when a genuinely
dynamic call needs to declare a specific static key as used and doing so
meaningfully narrows the namespace blind spot.

## Form Pattern

- Server actions with `bindArgsSchemas` must be bound before passing to hooks:
  `createThingAction.bind(null, workspaceId)`.
- No-input delete actions call `execute()` with no arguments, not `execute({})`.
- Validation schemas live near the feature, usually `schema/action.ts`.

### Form field component priority

When building a form field, always choose the highest-priority option that fits:

1. **Defined form field from `@chatbotx.io/ui/components/form/*`** — first choice.
   These components wrap `FormFieldWrapper` internally, handling label, optional
   marker, description, and `FormMessage` automatically. No manual
   `FormField`/`FormItem`/`FormControl` boilerplate needed.
2. **Shadcn UI primitive from `@chatbotx.io/ui/components/ui/*`** wrapped in a
   manual `FormField` + `FormItem` block — only when no defined field fits (e.g.
   custom composite inputs not covered by the list below).
3. **Raw React/HTML element** — last resort only.

Available defined fields (import from `@chatbotx.io/ui/components/form/<name>`):

| Component | Use for |
|---|---|
| `InputField` | Text inputs |
| `InputNumberField` | Numeric inputs (renders stepper) |
| `TextareaField` | Multi-line text |
| `SelectField` | Single-select dropdowns; supports `allowClear`, `options`, `fetchOptionsUrl` |
| `ComboboxField` | Searchable single-select |
| `MultiSelectField` | Multi-select |
| `CheckboxField` | Boolean checkbox |
| `SwitchField` | Toggle switch |
| `RadioGroupField` | Radio group |
| `SliderField` | Range slider |
| `CalendarField` | Inline calendar |
| `DatePickerField` | Date picker popover |
| `ColorPickerField` | Color picker |
| `SelectTagsInputField` | Tag input with select |

All defined fields read `control` from `useFormContext`, so they only require a
`<Form {...form}>` provider ancestor.

```typescript
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"

// CORRECT — uses defined form field
<Form {...form}>
  <form onSubmit={handleSubmit}>
    <InputField name="name" label={t("fields.name.label")} required />
    <SelectField name="type" label={t("fields.type.label")} options={options} required />
    <InputNumberField name="position" label={t("fields.position.label")} min={0} />
  </form>
</Form>

// WRONG — manual boilerplate when a defined field exists
<FormField
  control={form.control}
  name="name"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t("fields.name.label")}</FormLabel>
      <FormControl><Input {...field} /></FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

## Layout and Components

- Mirror sibling features for tables, dialogs, toolbar actions, and columns.
- Keep server components responsible for data promises and client components
  responsible for interaction.
- Pages receive Promise `params` / `searchParams`.
- Client components unwrap server promises with `use(promises)` where this repo
  already follows that pattern.
- Public routes need `apps/builder/src/proxy.ts` public route registration.

## Styling Guidance

- Keep operational UI dense, scan-friendly, and consistent with existing builder
  screens.
- Do not create landing-page style layouts for product workflows.
- Avoid nested cards and oversized hero typography inside tools.
- Ensure button and table text fits at mobile and desktop sizes.

### RTL / Logical Properties

The app supports RTL locales (Arabic ships as `ar`). Default to Tailwind's
logical-property utilities for any new or edited class — never reach for a
physical-direction class first.

| Physical (avoid) | Logical (use) |
|---|---|
| `left-*` | `start-*` (or `inset-s-*` for `inset-*` positioning) |
| `right-*` | `end-*` (or `inset-e-*` for `inset-*` positioning) |
| `ml-*` | `ms-*` |
| `mr-*` | `me-*` |
| `pl-*` | `ps-*` |
| `pr-*` | `pe-*` |
| `border-l-*` | `border-s-*` |
| `border-r-*` | `border-e-*` |
| `rounded-l-*` | `rounded-s-*` |
| `rounded-r-*` | `rounded-e-*` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |

- `space-x-*` and `divide-x-*` are already logical in Tailwind v4 (compile to
  `margin-inline-start/end` / `border-inline-start/end-width`) — leave them as
  they are, don't rewrite them.
- Directional chevrons/arrows (dropdown submenu carets, pagination prev/next,
  breadcrumb separators, wizard next/prev arrows) should flip in RTL via
  `rtl:rotate-180`, matching the existing convention in `carousel.tsx`,
  `calendar.tsx`, and `sidebar.tsx`.
- `translate-x-*` needs case-by-case judgment, not a blind swap: a centering
  pair (`start-1/2` + `-translate-x-1/2`) stays as-is since X-axis centering is
  symmetric; a genuinely directional slide (e.g. a switch thumb) needs
  `ltr:translate-x-...`/`rtl:translate-x-...` treatment, per `switch.tsx`.
- Carve-outs — physical classes are correct here, do not "fix" them:
  - `data-[side=...]` selectors driven by a positioning engine (e.g. popover
    collision avoidance) respond to runtime layout side, not text direction.
  - Physical `side` props on components like `sheet.tsx`/`sidebar.tsx` are an
    intentional component API; their internals already map to logical CSS.
  - Keyboard event key codes (`e.key === "ArrowLeft"`) are a browser API, not
    a CSS utility.
  - Symmetric `inset-x-0` (equal both sides) has no more "logical" form.
  - `packages/mail/src/emails` — email clients have poor RTL support, keep
    physical unless a dedicated task addresses this.

## Verification

Run targeted checks for touched UI:

```bash
pnpm --filter builder check-types
pnpm --filter builder test
pnpm lint
```

If visual layout risk is high, start the builder dev server and inspect the page.
