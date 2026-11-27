# Forms

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
