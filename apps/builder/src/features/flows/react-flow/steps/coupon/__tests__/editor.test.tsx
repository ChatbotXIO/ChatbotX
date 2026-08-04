// @vitest-environment jsdom
import {
  type CouponStepSchema,
  setUpCouponStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  act,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  Controller,
  FormProvider,
  type Resolver,
  useForm,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"
import { CouponActionEditor } from "../editor"

const useCouponTopicOptionsMock = vi.fn()

vi.mock("@/features/coupons/provider/use-coupon-topic-options", () => ({
  useCouponTopicOptions: (props: { issueableOnly?: boolean } = {}) =>
    useCouponTopicOptionsMock(props),
}))

vi.mock("@chatbotx.io/ui/components/form/combobox-field", async () => {
  const { useFormContext } = await import("react-hook-form")
  return {
    ComboboxField: ({
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
                data-testid={`combobox-${name}`}
                onChange={(event) => {
                  field.onChange(event.target.value)
                }}
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

vi.mock("@chatbotx.io/ui/components/form/select-field", async () => {
  const { useFormContext } = await import("react-hook-form")
  return {
    SelectField: ({
      name,
      options,
      triggerValueChange,
      label,
    }: {
      name: string
      options: { label: string; value: string }[]
      triggerValueChange?: (value?: string) => void
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
                onChange={(event) => {
                  field.onChange(event.target.value)
                  triggerValueChange?.(event.target.value)
                }}
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
    <button {...props}>{children}</button>
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
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@chatbotx.io/ui/components/ui/form", async () => {
  const { FormProvider } = await import("react-hook-form")
  return { Form: FormProvider }
})

vi.mock("../base/editor", () => ({
  BaseStepEditor: ({
    title,
    children,
  }: {
    title: string
    children: ReactNode
  }) => (
    <section data-testid="base-step-editor" data-title={title}>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "actions.cancel": "actions.cancel",
      "actions.continue": "actions.continue",
      "actions.noRecordFound": "actions.noRecordFound",
      "actions.pleaseSelect": "actions.pleaseSelect",
      "actions.update": "actions.update",
      "coupons.description": "coupons.description",
      "coupons.fields.topic": "coupons.fields.topic",
      "fields.type.label": "fields.type.label",
      "flows.actions.markCouponUsed": "flows.actions.markCouponUsed",
      "flows.actions.setUpCoupon": "flows.actions.setUpCoupon",
    })[key] ?? key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  readCouponStep = null
  useCouponTopicOptionsMock.mockReset()
  useCouponTopicOptionsMock.mockImplementation(
    ({ issueableOnly }: { issueableOnly?: boolean } = {}) => ({
      options: issueableOnly
        ? [{ label: "Issueable topic", value: "topic-issueable" }]
        : [
            { label: "Issueable topic", value: "topic-issueable" },
            { label: "Expired topic", value: "topic-expired" },
          ],
      labelById: new Map([
        ["topic-issueable", "Issueable topic"],
        ["topic-expired", "Expired topic"],
      ]),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      topics: [],
    }),
  )
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

const render = (ui: ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

function Harness({
  defaultStep = {
    id: "step-1",
    stepType: stepTypes.enum.setUpCoupon,
    topicId: "topic-issueable",
  },
}: {
  defaultStep?: CouponStepSchema
}) {
  const form = useForm<{ step: CouponStepSchema }>({
    defaultValues: { step: defaultStep },
  })

  return (
    <FormProvider {...form}>
      <CouponActionEditor parentName="step" />
    </FormProvider>
  )
}

let readCouponStep: (() => CouponStepSchema) | null = null

const invalidCouponStep = {
  id: "step-1",
  stepType: stepTypes.enum.setUpCoupon,
  topicId: "",
} as CouponStepSchema

const couponParentResolver = zodResolver(
  z.object({ step: setUpCouponStepSchema }),
) as unknown as Resolver<{ step: CouponStepSchema }>

function ValidityHarness() {
  const form = useForm<{ step: CouponStepSchema }>({
    resolver: couponParentResolver,
    mode: "onChange",
    defaultValues: { step: invalidCouponStep },
  })
  readCouponStep = () => form.getValues("step")
  const { isValid } = form.formState

  return (
    <FormProvider {...form}>
      <div data-testid="outer-valid">{String(isValid)}</div>
      <CouponActionEditor parentName="step" />
    </FormProvider>
  )
}

const flushCoupon = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("CouponActionEditor", () => {
  test("enables the parent form once a coupon topic is chosen and saved", async () => {
    // Real coupon topic ids are numeric (validated by zodBigintAsString).
    useCouponTopicOptionsMock.mockReturnValue({
      options: [{ label: "Topic 1", value: "1" }],
      labelById: new Map([["1", "Topic 1"]]),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      topics: [],
    })
    render(<ValidityHarness />)
    await flushCoupon()

    // The empty default topicId keeps the parent form invalid at first.
    expect(
      container.querySelector('[data-testid="outer-valid"]')?.textContent,
    ).toBe("false")

    const topicSelect = container.querySelector(
      '[data-testid="combobox-topicId"]',
    ) as HTMLSelectElement

    await act(async () => {
      topicSelect.value = "1"
      topicSelect.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })
    await flushCoupon()

    const submitButton = container.querySelector(
      'form button[type="submit"]',
    ) as HTMLButtonElement

    await act(async () => {
      submitButton.click()
      await Promise.resolve()
    })
    await flushCoupon()

    expect(
      container.querySelector('[data-testid="outer-valid"]')?.textContent,
    ).toBe("true")
    expect(readCouponStep?.()).toEqual({
      id: "step-1",
      stepType: stepTypes.enum.setUpCoupon,
      topicId: "1",
    })
  })

  test("switches schemas and preserves topicId while changing type", async () => {
    render(<Harness />)

    const stepTypeSelect = container.querySelector(
      '[data-testid="select-stepType"]',
    ) as HTMLSelectElement
    const topicSelect = container.querySelector(
      '[data-testid="combobox-topicId"]',
    ) as HTMLSelectElement

    expect(stepTypeSelect.value).toBe(stepTypes.enum.setUpCoupon)
    expect(topicSelect.value).toBe("topic-issueable")
    expect(useCouponTopicOptionsMock).toHaveBeenCalledWith({
      issueableOnly: true,
    })

    await act(async () => {
      stepTypeSelect.value = stepTypes.enum.markCouponUsed
      stepTypeSelect.dispatchEvent(new Event("change", { bubbles: true }))
      await Promise.resolve()
    })

    expect(stepTypeSelect.value).toBe(stepTypes.enum.markCouponUsed)
    expect(useCouponTopicOptionsMock).toHaveBeenCalledWith({
      issueableOnly: false,
    })
    expect(
      (
        container.querySelector(
          '[data-testid="combobox-topicId"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe("topic-issueable")
  })
})
