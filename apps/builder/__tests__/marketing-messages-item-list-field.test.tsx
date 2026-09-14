// @vitest-environment jsdom

import type { ReactElement, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useForm,
  useFormContext,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ButtonListField } from "@/features/facebook-marketing-messages/components/content/button-list-field"
import { QuickReplyListField } from "@/features/facebook-marketing-messages/components/content/quick-reply-list-field"

// `handleSubmit` resolves asynchronously, so the confirm path needs async act.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

/**
 * Base UI's dialog portals its popup and drives it through transitions, neither
 * of which cooperates with this bare `createRoot` harness. This stand-in keeps
 * the two contracts under test: the content renders while open, and `DialogClose`
 * reports the close back through `onOpenChange`.
 */
vi.mock("@chatbotx.io/ui/components/ui/dialog", async () => {
  const react = await import("react")
  const CloseCtx = react.createContext<(open: boolean) => void>(() => undefined)
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>

  return {
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children: ReactNode
      onOpenChange: (open: boolean) => void
    }) => (
      <CloseCtx.Provider value={onOpenChange}>{children}</CloseCtx.Provider>
    ),
    DialogContent: ({ children }: { children: ReactNode }) => (
      <div data-testid="dialog-content">{children}</div>
    ),
    DialogClose: ({
      render,
    }: {
      render: ReactElement<{ onClick?: () => void }>
    }) => {
      const onOpenChange = react.useContext(CloseCtx)
      return react.cloneElement(render, { onClick: () => onOpenChange(false) })
    },
    DialogHeader: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
  }
})

/** Portal-backed options cannot be opened from jsdom; expose one button each. */
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({
    name,
    options,
    triggerValueChange,
  }: {
    name: string
    options: { value: string; label: string }[]
    triggerValueChange?: (value: string) => void
  }) => {
    const { setValue } = useFormContext()
    return (
      <div>
        {options.map((option) => (
          <button
            data-testid={`${name}:${option.value}`}
            key={option.value}
            onClick={() => {
              setValue(name, option.value)
              triggerValueChange?.(option.value)
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    )
  },
}))

// The action editor reads the flow store, which these assertions never exercise.
vi.mock("@/features/flows/provider/flow-hook", () => ({
  useFlowSelectOptions: () => [{ value: "10", label: "Flow A" }],
  getFlowNodesOptions: () => [{ value: "20", label: "Node A" }],
}))
vi.mock("@/features/flows/provider/flow-store-context", () => ({
  useFlowStore: () => [{ id: "10", flowVersions: [] }],
}))

const button = (id: string, title: string) => ({
  id,
  title,
  actionType: "openWebsite" as const,
  url: "https://example.com",
  browserSize: 100 as const,
})

let form: UseFormReturn<FieldValues>

function Harness() {
  form = useForm({
    defaultValues: {
      content: { buttons: [button("301", "Alpha"), button("302", "Beta")] },
    },
  }) as unknown as UseFormReturn<FieldValues>

  return (
    <FormProvider {...form}>
      <ButtonListField name="content.buttons" />
    </FormProvider>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<Harness />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const rows = () =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="mm-item-row"]',
    ),
  )

const dialog = () => container.querySelector('[data-testid="dialog-content"]')

const openRow = (index: number) => act(() => rows()[index]?.click())

const titleInput = () =>
  dialog()?.querySelector<HTMLInputElement>('input[name="title"]')

const dialogButton = (text: string) =>
  Array.from(
    dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((element) => element.textContent === text)

const clickText = (text: string) => act(() => dialogButton(text)?.click())

/**
 * jsdom does not run implicit form submission from a submit button's `click()`,
 * so the event is dispatched on the form itself — after asserting the button
 * that would raise it is actually enabled. `handleSubmit` runs the zod resolver,
 * which settles a microtask later, hence the async act.
 */
const confirm = async () => {
  expect(dialogButton("actions.confirm")?.disabled).toBe(false)
  const element = dialog()?.querySelector("form")
  await act(async () => {
    element?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    )
    // Let the resolver's promise settle inside the same act scope.
    await Promise.resolve()
  })
}

/** Async because RHF re-validates — and so recomputes `isValid` — off-tick. */
const type = async (
  input: HTMLInputElement | null | undefined,
  value: string,
) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set
  await act(async () => {
    setter?.call(input, value)
    input?.dispatchEvent(new Event("input", { bubbles: true }))
    // Let the resolver's promise settle inside the same act scope.
    await Promise.resolve()
  })
}

describe("ButtonListField — dialog editing", () => {
  test("collapses each button to a row and leaves the dialog closed", () => {
    expect(rows()).toHaveLength(2)
    expect(rows()[0]?.textContent).toContain("Alpha")
    expect(dialog()).toBe(null)
  })

  test("opens the dialog seeded from the clicked row", () => {
    openRow(1)

    expect(dialog()).not.toBe(null)
    expect(titleInput()?.value).toBe("Beta")
  })

  test("confirming writes the edit back to the outer form", async () => {
    openRow(0)
    await type(titleInput(), "Renamed")
    await confirm()

    expect(form.getValues("content.buttons.0.title")).toBe("Renamed")
    // The row label tracks the stored value, and the dialog is gone.
    expect(rows()[0]?.textContent).toContain("Renamed")
    expect(dialog()).toBe(null)
  })

  test("cancelling discards the edit", async () => {
    openRow(0)
    await type(titleInput(), "Discarded")
    clickText("actions.cancel")

    expect(form.getValues("content.buttons.0.title")).toBe("Alpha")
    expect(dialog()).toBe(null)
  })

  test("deleting removes the row", () => {
    openRow(0)
    clickText("actions.delete")

    expect(rows()).toHaveLength(1)
    expect(form.getValues("content.buttons")).toHaveLength(1)
    expect(form.getValues("content.buttons.0.title")).toBe("Beta")
  })

  test("adding appends a row without opening its dialog", () => {
    const add = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((element) => element.textContent?.includes("actions.add"))
    act(() => add?.click())

    expect(rows()).toHaveLength(3)
    // Strictly click-to-edit: the new row waits to be opened like any other.
    expect(dialog()).toBe(null)

    openRow(2)
    expect(titleInput()?.value).toBe("")
  })
})

function QuickReplyHarness() {
  form = useForm({
    defaultValues: {
      content: {
        quickReplies: [
          {
            id: "401",
            contentType: "text",
            title: "Yes",
            action: { actionType: "startExternalFlow", flowId: "10" },
          },
        ],
      },
    },
  }) as unknown as UseFormReturn<FieldValues>

  return (
    <FormProvider {...form}>
      <QuickReplyListField name="content.quickReplies" />
    </FormProvider>
  )
}

const selectContentType = (value: string) => {
  const option = dialog()?.querySelector<HTMLButtonElement>(
    `[data-testid="contentType:${value}"]`,
  )
  act(() => option?.click())
}

const actionSelect = () =>
  dialog()?.querySelector('[data-testid="action.actionType:startExternalFlow"]')

/**
 * Tapping a phone or email quick reply returns the contact's own value, so
 * neither carries a title or an action.
 */
describe("QuickReplyListField — contentType drives the visible fields", () => {
  beforeEach(() => {
    act(() => root.render(<QuickReplyHarness />))
    openRow(0)
  })

  test("shows the title and action for a text reply", () => {
    expect(titleInput()).not.toBe(null)
    expect(actionSelect()).not.toBe(null)
  })

  test("hides both for a phone reply", () => {
    selectContentType("user_phone_number")

    expect(actionSelect()).toBe(null)
    expect(titleInput()).toBe(null)
  })

  test("saves a phone reply without the action it carried as text", async () => {
    selectContentType("user_phone_number")
    // A leftover half-filled action would keep the item invalid with no
    // visible field to fix it, so Confirm must be reachable and the saved
    // item must have dropped it.
    await confirm()

    expect(form.getValues("content.quickReplies.0")).toEqual({
      id: "401",
      contentType: "user_phone_number",
    })
  })

  test("hides both for an email reply", () => {
    selectContentType("user_email")

    expect(actionSelect()).toBe(null)
    expect(titleInput()).toBe(null)
  })

  test("restores them when switching back to text", () => {
    selectContentType("user_email")
    selectContentType("text")

    expect(titleInput()).not.toBe(null)
    expect(actionSelect()).not.toBe(null)
  })
})
