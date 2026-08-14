// @vitest-environment jsdom
import { executeJavascriptStepDefaultFn } from "@chatbotx.io/flow-config"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  Controller,
  FormProvider,
  type UseFormReturn,
  useForm,
  useFormContext,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import ExecuteJavascriptStepEditor from "../execute-javascript/editor"

const tiptapEditorFieldMock = vi.fn()

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: (props: {
    enableEmoji?: boolean
    label?: string
    name: string
    placeholder?: string
    required?: boolean
    showEmojiPicker?: boolean
  }) => {
    tiptapEditorFieldMock(props)
    const form = useFormContext()
    return (
      <Controller
        control={form.control}
        name={props.name}
        render={({ field }) => (
          <label>
            {props.label}
            <textarea
              data-testid={`tiptap-${props.name}`}
              onChange={(event) => field.onChange(event.target.value)}
              value={field.value ?? ""}
            />
          </label>
        )}
      />
    )
  },
}))

vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: ({ name, label }: { name: string; label?: string }) => {
    const form = useFormContext()
    return (
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <label>
            {label}
            <select
              data-testid={`custom-field-${name}`}
              onChange={(event) => field.onChange(event.target.value)}
              value={field.value ?? ""}
            >
              <option value="">--</option>
              <option value="field-1">Field 1</option>
            </select>
          </label>
        )}
      />
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogClose: ({ render }: { render: ReactNode }) => <>{render}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTrigger: ({ render }: { render: ReactNode }) => <>{render}</>,
}))

vi.mock("@chatbotx.io/ui/components/ui/form", async () => {
  const { FormProvider: RealFormProvider } = await import("react-hook-form")
  return { Form: RealFormProvider }
})

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  tiptapEditorFieldMock.mockReset()
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

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

const setTextareaValue = (textarea: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

const emptyStep = {
  ...executeJavascriptStepDefaultFn(),
  id: "step-1",
}

function Harness() {
  const form = useForm({
    defaultValues: { step: emptyStep },
  })

  return (
    <FormProvider {...form}>
      <ExecuteJavascriptStepEditor parentName="step" />
    </FormProvider>
  )
}

describe("ExecuteJavascriptStepEditor", () => {
  test("disables emoji substitution and the emoji picker for the code editor", async () => {
    act(() => {
      root.render(<Harness />)
    })
    await flush()

    expect(tiptapEditorFieldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enableEmoji: false,
        showEmojiPicker: false,
        name: "code",
      }),
    )
  })

  test("disables save while code or customFieldId is empty, enables once both are filled", async () => {
    act(() => {
      root.render(<Harness />)
    })
    await flush()

    const submitButton = container.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement
    expect(submitButton.disabled).toBe(true)

    const codeInput = container.querySelector(
      '[data-testid="tiptap-code"]',
    ) as HTMLTextAreaElement
    const customFieldSelect = container.querySelector(
      '[data-testid="custom-field-customFieldId"]',
    ) as HTMLSelectElement

    await act(async () => {
      setTextareaValue(codeInput, "return input.first_name")
      await Promise.resolve()
    })
    await flush()
    expect(submitButton.disabled).toBe(true)

    await act(async () => {
      customFieldSelect.value = "field-1"
      customFieldSelect.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })
    await flush()

    expect(submitButton.disabled).toBe(false)
  })

  test("writes code and customFieldId back onto the parent form on submit, preserving code containing emoticon-like operators", async () => {
    const formApiRef: {
      current: UseFormReturn<{ step: typeof emptyStep }> | null
    } = { current: null }

    function ParentHarness() {
      const form = useForm({
        defaultValues: { step: emptyStep },
      })
      formApiRef.current = form
      return (
        <FormProvider {...form}>
          <ExecuteJavascriptStepEditor parentName="step" />
        </FormProvider>
      )
    }

    act(() => {
      root.render(<ParentHarness />)
    })
    await flush()

    const codeWithOperators =
      "const a = x ? y :/ z; // trailing :-) comment\nreturn a"
    const codeInput = container.querySelector(
      '[data-testid="tiptap-code"]',
    ) as HTMLTextAreaElement
    const customFieldSelect = container.querySelector(
      '[data-testid="custom-field-customFieldId"]',
    ) as HTMLSelectElement

    await act(async () => {
      setTextareaValue(codeInput, codeWithOperators)
      customFieldSelect.value = "field-1"
      customFieldSelect.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })
    await flush()

    const submitButton = container.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement
    await act(async () => {
      submitButton.click()
      await Promise.resolve()
    })
    await flush()

    expect(formApiRef.current?.getValues("step.code")).toBe(codeWithOperators)
    expect(formApiRef.current?.getValues("step.customFieldId")).toBe("field-1")
  })

  // A leading-indentation round-trip test is intentionally omitted here: this
  // suite mocks TiptapEditorField with a plain <textarea> (see the top of this
  // file) so the emoji/props assertions above stay fast and stable. A real
  // contenteditable-vs-space-collapsing regression can only be observed against
  // the actual Tiptap/ProseMirror DOM, not this mock — see the review notes on
  // the execute-javascript step for that known, pre-existing hazard.
})
