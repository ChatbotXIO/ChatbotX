// @vitest-environment jsdom
import { formFieldTypes, operatorTypes } from "@chatbotx.io/database/partials"
import { act, type ButtonHTMLAttributes, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useFormContext } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  ContactFilterConditionDialog,
  isValidDateTimeConditionValue,
} from "@/features/contact-filter/components/contact-filter-condition-dialog"
import type {
  ConditionOption,
  FieldConfig,
} from "@/features/contact-filter/components/contact-filter-config"

vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: ({
    name,
    options,
  }: {
    name: string
    options: { label: string; value: string }[]
  }) => {
    const form = useFormContext()

    return (
      <select data-testid={`combobox-${name}`} {...form.register(name)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/form/input-field", () => ({
  InputField: ({
    name,
    type,
    placeholder,
    label,
  }: {
    name: string
    type?: string
    placeholder?: string
    label?: string
  }) => {
    const form = useFormContext()

    return (
      <label>
        {label}
        <input
          data-testid={`input-${name}`}
          placeholder={placeholder}
          type={type ?? "text"}
          {...form.register(name)}
        />
      </label>
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/form/multi-select-field", () => ({
  MultiSelectField: ({
    name,
    options,
  }: {
    name: string
    options: { label: string; value: string }[]
  }) => {
    const form = useFormContext()

    return (
      <select
        data-testid={`multi-select-${name}`}
        multiple
        {...form.register(name)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({
    name,
    options,
  }: {
    name: string
    options: { label: string; value: string }[]
  }) => {
    const form = useFormContext()

    return (
      <select data-testid={`select-${name}`} {...form.register(name)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: () => null,
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}))

vi.mock("@chatbotx.io/ui/components/ui/form", async () => {
  const { FormProvider } = await import("react-hook-form")
  return { Form: FormProvider }
})

vi.mock("@/components/tiptap/plain-text-editor-field", () => ({
  PlainTextEditorField: ({
    name,
    placeholder,
    label,
  }: {
    name: string
    placeholder?: string
    label?: string
  }) => {
    const form = useFormContext()

    return (
      <label>
        {label}
        <input
          data-testid={`plain-text-${name}`}
          placeholder={placeholder}
          {...form.register(name)}
        />
      </label>
    )
  },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "actions.cancel": "Cancel",
      "actions.noRecordFound": "No record found",
      "actions.pleaseSelect": "Please select",
      "actions.save": "Save",
      "condition.datetimePlaceholder": "YYYY-MM-DD HH:mm",
      "condition.valuePlaceholder": "Type it...",
      "condition.yes": "Yes",
      "condition.no": "No",
      "fields.from.label": "From",
      "fields.to.label": "To",
    })[key] ?? key,
}))

const conditionOptions: ConditionOption[] = [
  { label: "Is", value: operatorTypes.enum.eq },
  { label: "Has any value", value: operatorTypes.enum.isNotEmpty },
  { label: "Used", value: operatorTypes.enum.used },
  { label: "Between", value: operatorTypes.enum.isBetween },
]

const configs = {
  text: {
    name: "fullName",
    formField: formFieldTypes.enum.text,
    group: "contactInfo",
  },
  number: {
    name: "lastSeenMinutesAgo",
    formField: formFieldTypes.enum.number,
    group: "analytics",
  },
  datetime: {
    name: "lastSeen",
    formField: formFieldTypes.enum.datetime,
    group: "analytics",
  },
  boolean: {
    name: "blocked",
    formField: formFieldTypes.enum.boolean,
    group: "contactInfo",
  },
  select: {
    name: "gender",
    formField: formFieldTypes.enum.select,
    group: "contactInfo",
    options: [{ label: "Female", value: "female" }],
  },
  multiSelect: {
    name: "tags",
    formField: formFieldTypes.enum.multiSelect,
    group: "analytics",
    options: [{ label: "VIP", value: "tag-1" }],
  },
  couponTopic: {
    name: "couponTopic:topic-1",
    topicId: "topic-1",
    formField: formFieldTypes.enum.text,
    group: "topicCoupon",
  },
} as const satisfies Record<string, FieldConfig>

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
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

const renderDialog = ({
  config,
  operator = operatorTypes.enum.eq,
  value = "x",
  enableVariables = false,
}: {
  config: FieldConfig
  operator?: string
  value?: string | string[]
  enableVariables?: boolean
}) => {
  const onSubmit = vi.fn()
  act(() => {
    root.render(
      <ContactFilterConditionDialog
        conditionOptions={conditionOptions}
        configs={[config]}
        enableVariables={enableVariables}
        initialDraft={{
          field: config.name,
          operator,
          value,
        }}
        key={`${config.name}:${operator}:${JSON.stringify(value)}:${enableVariables}`}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
        title="Condition"
      />,
    )
  })

  return { onSubmit }
}

describe("ContactFilterConditionDialog value inputs", () => {
  test("renders free-text inputs for text, number, and datetime values", () => {
    renderDialog({ config: configs.text })
    expect(
      container
        .querySelector('[data-testid="input-value"]')
        ?.getAttribute("placeholder"),
    ).toBe("Type it...")

    renderDialog({ config: configs.number })
    expect(
      container
        .querySelector('[data-testid="input-value"]')
        ?.getAttribute("type"),
    ).toBe("number")

    renderDialog({ config: configs.datetime, value: "2026-05-19 10:30" })
    expect(
      container
        .querySelector('[data-testid="input-value"]')
        ?.getAttribute("placeholder"),
    ).toBe("YYYY-MM-DD HH:mm")
  })

  test("renders variable-enabled plain text inputs only when requested", () => {
    renderDialog({ config: configs.datetime, enableVariables: true })

    expect(
      container
        .querySelector('[data-testid="plain-text-value"]')
        ?.getAttribute("placeholder"),
    ).toBe("YYYY-MM-DD HH:mm")
    expect(container.querySelector('[data-testid="input-value"]')).toBeNull()
  })

  test("keeps boolean and option fields on select controls", () => {
    renderDialog({ config: configs.boolean, value: "true" })
    expect(
      container.querySelector('[data-testid="select-value"]'),
    ).not.toBeNull()
    expect(container.textContent).toContain("Yes")
    expect(container.textContent).toContain("No")

    renderDialog({ config: configs.select, value: "female" })
    expect(
      container.querySelector('[data-testid="select-value"]'),
    ).not.toBeNull()

    renderDialog({ config: configs.multiSelect, value: ["tag-1"] })
    expect(
      container.querySelector('[data-testid="multi-select-value"]'),
    ).not.toBeNull()
  })

  test("renders two free-text inputs for interval values", () => {
    renderDialog({
      config: configs.datetime,
      operator: operatorTypes.enum.isBetween,
      value: ["2026-05-19 10:30", "2026-05-20 10:30"],
    })

    expect(
      container
        .querySelector('[data-testid="input-value.0"]')
        ?.getAttribute("placeholder"),
    ).toBe("YYYY-MM-DD HH:mm")
    expect(
      container
        .querySelector('[data-testid="input-value.1"]')
        ?.getAttribute("placeholder"),
    ).toBe("YYYY-MM-DD HH:mm")
  })

  test("validates datetime text and variable placeholders", () => {
    expect(isValidDateTimeConditionValue("2026-05-19 10:30")).toBe(true)
    expect(isValidDateTimeConditionValue("{{first_name}}")).toBe(true)
    expect(isValidDateTimeConditionValue("2026-13-40")).toBe(false)
    expect(isValidDateTimeConditionValue("junk")).toBe(false)
  })

  test("submits variable placeholder strings from variable-enabled inputs", async () => {
    const { onSubmit } = renderDialog({
      config: configs.datetime,
      enableVariables: true,
      value: "{{first_name}}",
    })

    act(() => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true }),
        )
    })

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        field: "lastSeen",
        operator: operatorTypes.enum.eq,
        value: "{{first_name}}",
      })
    })
  })

  test("disables save for malformed datetime values", () => {
    const invalidDialog = renderDialog({
      config: configs.datetime,
      value: "2026-13-40",
    })
    expect(
      (
        container.querySelector(
          'button[type="submit"]',
        ) as HTMLButtonElement | null
      )?.disabled,
    ).toBe(true)
    act(() => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true }),
        )
    })
    expect(invalidDialog.onSubmit).not.toHaveBeenCalled()

    renderDialog({ config: configs.datetime, value: "{{first_name}}" })
    expect(
      (
        container.querySelector(
          'button[type="submit"]',
        ) as HTMLButtonElement | null
      )?.disabled,
    ).toBe(false)
  })

  test("keeps save enabled for coupon topic used without a value input", () => {
    renderDialog({
      config: configs.couponTopic,
      operator: operatorTypes.enum.used,
      value: "",
    })

    expect(container.querySelector('[data-testid="input-value"]')).toBeNull()
    expect(
      (
        container.querySelector(
          'button[type="submit"]',
        ) as HTMLButtonElement | null
      )?.disabled,
    ).toBe(false)
  })
})
