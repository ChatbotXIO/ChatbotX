// @vitest-environment jsdom
import type { MetaCapiEventFieldsSchema } from "@chatbotx.io/flow-config"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import type { ReactElement, ReactNode } from "react"
import { act, createContext, useContext, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  Controller,
  FormProvider,
  type UseFormReturn,
  useForm,
  useFormContext,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MetaCapiEventDialog } from "@/features/meta-conversions/components/meta-capi-event-dialog"

/** Echoes the key back so assertions never depend on translated copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// ---------------------------------------------------------------------------
// Dialog primitives: a minimal controlled stand-in that keeps its content
// mounted (via `hidden`, never unmounted) while closed — mirroring Base UI's
// real behavior of keeping the portal mounted through the close transition
// (see dialog.tsx comments) — so the remount-on-reopen fix is actually
// exercised by the "rapid close→reopen" test rather than papered over by a
// mock that unmounts on close by itself.
// ---------------------------------------------------------------------------
type DialogCtxValue = { open: boolean; setOpen: (next: boolean) => void }
const DialogCtx = createContext<DialogCtxValue>({
  open: false,
  setOpen: () => undefined,
})

vi.mock("@chatbotx.io/ui/components/ui/dialog", async () => {
  const react = await import("react")
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  return {
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: ReactNode
      open: boolean
      onOpenChange: (next: boolean) => void
    }) => (
      <DialogCtx.Provider value={{ open, setOpen: onOpenChange }}>
        {children}
      </DialogCtx.Provider>
    ),
    DialogTrigger: ({
      render,
    }: {
      render: ReactElement<{ onClick?: () => void }>
    }) => {
      const { setOpen } = react.useContext(DialogCtx)
      return react.cloneElement(render, { onClick: () => setOpen(true) })
    },
    DialogClose: ({
      render,
    }: {
      render: ReactElement<{ onClick?: () => void }>
    }) => {
      const { setOpen } = react.useContext(DialogCtx)
      return react.cloneElement(render, { onClick: () => setOpen(false) })
    },
    DialogContent: ({ children }: { children: ReactNode }) => {
      const { open } = react.useContext(DialogCtx)
      return (
        <div data-testid="dialog-content" hidden={!open}>
          {children}
        </div>
      )
    },
    DialogHeader: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
  }
})

// Base UI's Tooltip only mounts its popup once actually opened; not relevant
// to this test's assertions.
vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}))

// Collapsible: a minimal controlled stand-in, default closed.
vi.mock("@chatbotx.io/ui/components/ui/collapsible", () => {
  const CollapsibleCtx = createContext<{
    open: boolean
    setOpen: (next: boolean) => void
  }>({ open: false, setOpen: () => undefined })
  return {
    Collapsible: ({ children }: { children: ReactNode }) => {
      const [open, setOpen] = useState(false)
      return (
        <CollapsibleCtx.Provider value={{ open, setOpen }}>
          {children}
        </CollapsibleCtx.Provider>
      )
    },
    CollapsibleTrigger: ({
      children,
      className,
    }: {
      children: ReactNode
      className?: string
    }) => {
      const { open, setOpen } = useContext(CollapsibleCtx)
      return (
        <button
          className={className}
          onClick={() => setOpen(!open)}
          type="button"
        >
          {children}
        </button>
      )
    },
    CollapsibleContent: ({ children }: { children: ReactNode }) => {
      const { open } = useContext(CollapsibleCtx)
      return open ? <div data-testid="advanced-content">{children}</div> : null
    },
  }
})

// PlainTextEditorField: real components need Tiptap/ProseMirror, which is
// not jsdom-friendly. This stand-in mirrors the one behavior under test —
// it snapshots `getValues(name)` once via a lazy initial state (mirroring
// the real component's mount-only effect at plain-text-editor-field.tsx:51)
// into an *uncontrolled* input, so a value written to the form after mount
// (e.g. by `form.reset`) is invisible unless the component remounts.
vi.mock("@/components/tiptap/plain-text-editor-field", () => ({
  PlainTextEditorField: ({ name, label }: { name: string; label?: string }) => {
    const { control, getValues } = useFormContext()
    const [initValue] = useState<string>(() => getValues(name) ?? "")
    return (
      <FormField
        control={control}
        name={name}
        render={({ field }) => (
          <FormItem>
            {label ? <FormLabel>{label}</FormLabel> : null}
            <FormControl>
              <input
                data-testid={`input-${name}`}
                defaultValue={initValue}
                onChange={(event) => field.onChange(event.target.value)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  },
}))

type SelectLikeOption = { value: string; label: string }
type GroupedOption = SelectLikeOption & { children?: SelectLikeOption[] }

const flattenOptions = (options: GroupedOption[]): SelectLikeOption[] =>
  options.flatMap((option) => option.children ?? [option])

// SelectField: flat native `<select>` bound the same way the real component
// binds — `field.onChange` then `triggerValueChange` — so
// `MetaCapiEventFields`'s action-source reset logic still runs.
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({
    name,
    options,
    label,
    triggerValueChange,
  }: {
    name: string
    options: SelectLikeOption[]
    label?: string
    triggerValueChange?: (value?: string) => void
  }) => {
    const { control } = useFormContext()
    return (
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <label>
            {label}
            <select
              data-testid={`select-${name}`}
              onChange={(event) => {
                field.onChange(event.target.value)
                triggerValueChange?.(event.target.value)
              }}
              value={field.value ?? ""}
            >
              <option value="">--</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      />
    )
  },
}))

// ComboboxField: flat native `<select>` over the flattened grouped options,
// preserving the real component's "field.onChange then triggerValueChange"
// order so the custom-event-sentinel handling in `MetaCapiEventFields` runs
// exactly as it does with the real Base UI combobox.
vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: ({
    name,
    options,
    label,
    triggerValueChange,
  }: {
    name: string
    options: GroupedOption[]
    label?: string
    triggerValueChange?: (value: string) => void
  }) => {
    const { control } = useFormContext()
    const flat = flattenOptions(options)
    return (
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <label>
            {label}
            <select
              data-testid={`combobox-${name}`}
              onChange={(event) => {
                field.onChange(event.target.value)
                triggerValueChange?.(event.target.value)
              }}
              value={field.value ?? ""}
            >
              {flat.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      />
    )
  },
}))

let container: HTMLDivElement
let root: Root
let formApi: UseFormReturn<{ step: MetaCapiEventFieldsSchema }> | null = null

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  formApi = null
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

const defaultFields: MetaCapiEventFieldsSchema = {
  eventName: "LeadSubmitted",
  actionSource: "business_messaging",
  contentType: undefined,
  contentIds: undefined,
  value: undefined,
  currency: undefined,
  contentCategory: undefined,
  contentName: undefined,
}

function Harness({
  initial = defaultFields,
}: {
  initial?: MetaCapiEventFieldsSchema
}) {
  const form = useForm<{ step: MetaCapiEventFieldsSchema }>({
    defaultValues: { step: initial },
  })
  formApi = form

  return (
    <FormProvider {...form}>
      <MetaCapiEventDialog parentName="step" />
    </FormProvider>
  )
}

const render = (initial?: MetaCapiEventFieldsSchema) => {
  act(() => {
    root.render(<Harness initial={initial} />)
  })
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function findByText(selector: string, text: string): HTMLElement {
  const found = Array.from(container.querySelectorAll(selector)).find(
    (element) => element.textContent?.includes(text),
  )
  if (!found) {
    throw new Error(`No "${selector}" with text "${text}" found`)
  }
  return found as HTMLElement
}

function openDialog() {
  const trigger = findByText("button", "actions.edit")
  act(() => {
    trigger.click()
  })
}

function clickConfirm() {
  const confirm = findByText("form button", "actions.confirm")
  act(() => {
    confirm.click()
  })
}

function clickCancel() {
  const cancel = findByText("form button", "actions.cancel")
  act(() => {
    cancel.click()
  })
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function selectOption(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

function input(name: string): HTMLInputElement {
  const found = container.querySelector(`[data-testid="input-${name}"]`)
  if (!found) {
    throw new Error(`input-${name} not found`)
  }
  return found as HTMLInputElement
}

function select(name: string, kind: "select" | "combobox" = "select") {
  const found = container.querySelector(`[data-testid="${kind}-${name}"]`)
  if (!found) {
    throw new Error(`${kind}-${name} not found`)
  }
  return found as HTMLSelectElement
}

describe("MetaCapiEventDialog", () => {
  test("opens the dialog when the trigger card is clicked", async () => {
    render()
    await flush()

    expect(
      (container.querySelector('[data-testid="dialog-content"]') as HTMLElement)
        .hidden,
    ).toBe(true)

    openDialog()
    await flush()

    expect(
      (container.querySelector('[data-testid="dialog-content"]') as HTMLElement)
        .hidden,
    ).toBe(false)
  })

  test("Purchase without currency shows both inline errors and does not write back", async () => {
    render()
    await flush()
    openDialog()
    await flush()

    selectOption(select("eventName", "combobox"), "Purchase")
    await flush()

    clickConfirm()
    await flush()

    expect(container.textContent).toContain(
      "Value is required for Purchase events",
    )
    expect(container.textContent).toContain(
      "Currency is required for Purchase events",
    )
    expect(formApi?.getValues("step")).toEqual(defaultFields)
  })

  test("Cancel discards edits made in the dialog", async () => {
    render()
    await flush()
    openDialog()
    await flush()

    setInputValue(input("value"), "42")
    await flush()

    clickCancel()
    await flush()

    expect(formApi?.getValues("step")).toEqual(defaultFields)
    expect(
      (container.querySelector('[data-testid="dialog-content"]') as HTMLElement)
        .hidden,
    ).toBe(true)
  })

  test("Confirm writes the edited values back to the parent", async () => {
    render()
    await flush()
    openDialog()
    await flush()

    setInputValue(input("value"), "42")
    setInputValue(input("currency"), "USD")
    await flush()

    clickConfirm()
    await flush()

    expect(formApi?.getValues("step")).toEqual({
      ...defaultFields,
      value: "42",
      currency: "USD",
    })
    expect(
      (container.querySelector('[data-testid="dialog-content"]') as HTMLElement)
        .hidden,
    ).toBe(true)
  })

  test("reopening after Confirm shows the confirmed values", async () => {
    render()
    await flush()
    openDialog()
    await flush()

    setInputValue(input("value"), "42")
    setInputValue(input("currency"), "USD")
    await flush()
    clickConfirm()
    await flush()

    openDialog()
    await flush()

    expect(input("value").value).toBe("42")
    expect(input("currency").value).toBe("USD")
  })

  test("reopening after Cancel shows the parent's values", async () => {
    render()
    await flush()
    openDialog()
    await flush()

    setInputValue(input("value"), "999")
    await flush()
    clickCancel()
    await flush()

    openDialog()
    await flush()

    expect(input("value").value).toBe("")
  })

  test("a rapid close→reopen still shows the parent's values (keyed remount)", async () => {
    render({ ...defaultFields, value: "100", currency: "USD" })
    await flush()
    openDialog()
    await flush()

    expect(input("value").value).toBe("100")

    // Edit the child form only — never confirmed.
    setInputValue(input("value"), "999")
    await flush()

    // Close without saving, then reopen immediately. The mocked
    // DialogContent never unmounts (see module mock above), so only the
    // `key={openCount}` remount in `MetaCapiEventDialog` can refresh the
    // stale, uncontrolled `PlainTextEditorField` stand-in.
    clickCancel()
    openDialog()
    await flush()

    expect(input("value").value).toBe("100")
  })

  test('with "email" selected, "Custom event…" reveals the input and a custom name round-trips', async () => {
    render()
    await flush()
    openDialog()
    await flush()

    selectOption(select("actionSource"), "email")
    await flush()

    selectOption(select("eventName", "combobox"), "__custom__")
    await flush()

    const customNameInput = container.querySelector(
      'input[name="eventName"]',
    ) as HTMLInputElement
    expect(customNameInput).toBeTruthy()

    setInputValue(customNameInput, "MyCustomEvent")
    await flush()

    clickConfirm()
    await flush()

    expect(formApi?.getValues("step.actionSource")).toBe("email")
    expect(formApi?.getValues("step.eventName")).toBe("MyCustomEvent")
  })

  test('choosing "Custom event…" shows no error until Confirm, then exactly one', async () => {
    render()
    await flush()
    openDialog()
    await flush()

    selectOption(select("actionSource"), "email")
    await flush()
    selectOption(select("eventName", "combobox"), "__custom__")
    await flush()

    const errorText = "Too small: expected string to have >=1 characters"
    expect(container.textContent).not.toContain(errorText)

    clickConfirm()
    await flush()

    const occurrences = container.textContent?.split(errorText).length ?? 1
    expect(occurrences - 1).toBe(1)
    expect(formApi?.getValues("step")).toEqual(defaultFields)
  })

  test('with "business_messaging" selected there is no "Custom event…" entry', async () => {
    render()
    await flush()
    openDialog()
    await flush()

    const options = Array.from(
      select("eventName", "combobox").querySelectorAll("option"),
    ).map((option) => option.textContent)

    expect(options).not.toContain("metaConversions.fields.eventType.custom")
  })

  test("switching email (Lead) to business_messaging resets the event to LeadSubmitted", async () => {
    render({ ...defaultFields, actionSource: "email", eventName: "Lead" })
    await flush()
    openDialog()
    await flush()

    selectOption(select("actionSource"), "business_messaging")
    await flush()
    clickConfirm()
    await flush()

    expect(formApi?.getValues("step.eventName")).toBe("LeadSubmitted")
  })

  test("switching business_messaging (Purchase) to email keeps Purchase", async () => {
    // Purchase requires value+currency regardless of action source, so the
    // initial fixture must already satisfy that or Confirm would fail
    // validation for an unrelated reason.
    render({
      ...defaultFields,
      actionSource: "business_messaging",
      eventName: "Purchase",
      value: "42",
      currency: "USD",
    })
    await flush()
    openDialog()
    await flush()

    selectOption(select("actionSource"), "email")
    await flush()
    clickConfirm()
    await flush()

    expect(formApi?.getValues("step.eventName")).toBe("Purchase")
    expect(formApi?.getValues("step.actionSource")).toBe("email")
  })

  test("the Advanced section is collapsed by default", async () => {
    render()
    await flush()
    openDialog()
    await flush()

    expect(
      container.querySelector('[data-testid="advanced-content"]'),
    ).toBeNull()
  })

  test("a legacy parent value with no actionSource opens pre-selected to business_messaging and confirm writes it back", async () => {
    // Flow versions saved before `actionSource` existed carry no value for
    // it at all, and the dialog restores the parent's raw value into the
    // child form on open (no zod defaults) — this simulates that shape.
    const { actionSource: _actionSource, ...legacyFields } = defaultFields
    const legacyValue = legacyFields as MetaCapiEventFieldsSchema

    render(legacyValue)
    await flush()
    openDialog()
    await flush()

    expect(select("actionSource").value).toBe("business_messaging")

    clickConfirm()
    await flush()

    expect(formApi?.getValues("step.actionSource")).toBe("business_messaging")
  })
})
