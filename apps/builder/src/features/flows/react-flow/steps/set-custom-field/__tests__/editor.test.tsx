// @vitest-environment jsdom
import {
  FieldOperationType,
  type SetCustomFieldStepSchema,
  setCustomFieldStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import { act, type ButtonHTMLAttributes, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  Controller,
  FormProvider,
  type UseFormReturn,
  useForm,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"
import SetCustomFieldStepEditor from "../editor"

vi.mock("@/features/contact-filter/lib/timezone", () => ({
  getBrowserTimezone: () => "UTC",
}))

vi.mock("@/features/custom-fields/provider/custom-field-store-context", () => ({
  useCustomFieldStore: (selector: (state: { customFields: [] }) => unknown) =>
    selector({ customFields: [] }),
}))

vi.mock("@/features/custom-fields/custom-field-select", async () => {
  const { useFormContext } = await import("react-hook-form")
  return {
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
  }
})

vi.mock("@/components/tiptap/plain-text-editor-field", async () => {
  const { useFormContext } = await import("react-hook-form")
  return {
    PlainTextEditorField: ({
      name,
      label,
    }: {
      name: string
      label?: string
    }) => {
      const form = useFormContext()
      return (
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <label>
              {label}
              <input
                data-testid={`input-${name}`}
                onChange={(event) => field.onChange(event.target.value)}
                value={field.value ?? ""}
              />
            </label>
          )}
        />
      )
    },
  }
})

vi.mock("@chatbotx.io/ui/components/form/select-field", async () => {
  const { useFormContext } = await import("react-hook-form")
  return {
    SelectField: ({
      name,
      options,
      label,
    }: {
      name: string
      options: { label: string; value: string }[]
      label?: string
    }) => {
      const form = useFormContext()
      return (
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <label>
              {label}
              <select
                data-testid={`select-${name}`}
                onChange={(event) => field.onChange(event.target.value)}
                value={field.value ?? ""}
              >
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
  }
})

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTrigger: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/form", async () => {
  const { FormProvider } = await import("react-hook-form")
  return { Form: FormProvider }
})

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root
let formApi: UseFormReturn<{ step: SetCustomFieldStepSchema }> | null = null

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

const invalidStep: SetCustomFieldStepSchema = {
  id: "step-1",
  stepType: stepTypes.enum.setCustomField,
  inputFieldId: "",
  operation: FieldOperationType.set,
  value: "",
}

function Harness() {
  const form = useForm<{ step: SetCustomFieldStepSchema }>({
    resolver: zodResolver(z.object({ step: setCustomFieldStepSchema })),
    mode: "onChange",
    defaultValues: { step: invalidStep },
  })
  formApi = form
  const { isValid } = form.formState

  return (
    <FormProvider {...form}>
      <div data-testid="outer-valid">{String(isValid)}</div>
      <SetCustomFieldStepEditor parentName="step" />
    </FormProvider>
  )
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

// Setting `.value` directly bypasses React's controlled-input value tracker, so
// `onChange` never fires. Go through the native setter the way user-event does.
const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("SetCustomFieldStepEditor", () => {
  test("enables the parent form after valid custom field data is submitted", async () => {
    act(() => {
      root.render(<Harness />)
    })
    await flush()

    // The empty default inputFieldId keeps the parent form invalid at first.
    expect(
      container.querySelector('[data-testid="outer-valid"]')?.textContent,
    ).toBe("false")

    const fieldSelect = container.querySelector(
      '[data-testid="custom-field-inputFieldId"]',
    ) as HTMLSelectElement
    const operationSelect = container.querySelector(
      '[data-testid="select-operation"]',
    ) as HTMLSelectElement
    const valueInput = container.querySelector(
      '[data-testid="input-value"]',
    ) as HTMLInputElement

    await act(async () => {
      fieldSelect.value = "field-1"
      fieldSelect.dispatchEvent(new Event("change", { bubbles: true }))
      operationSelect.value = FieldOperationType.append
      operationSelect.dispatchEvent(new Event("change", { bubbles: true }))
      setInputValue(valueInput, "Hello")
      await Promise.resolve()
    })
    await flush()

    const submitButton = container.querySelector(
      "form button:last-of-type",
    ) as HTMLButtonElement

    await act(async () => {
      submitButton.click()
      await Promise.resolve()
    })
    await flush()

    // Writing the valid values back into the parent must re-run its validation
    // so Confirm becomes enabled without a remount.
    expect(
      container.querySelector('[data-testid="outer-valid"]')?.textContent,
    ).toBe("true")

    // Every edited field must land on the parent step, and id/stepType are
    // preserved.
    expect(formApi?.getValues("step")).toEqual({
      id: "step-1",
      stepType: stepTypes.enum.setCustomField,
      inputFieldId: "field-1",
      operation: FieldOperationType.append,
      value: "Hello",
      timezone: "UTC",
    })
  })
})
