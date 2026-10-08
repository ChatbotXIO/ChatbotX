// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  FormProvider,
  type UseFormReturn,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}))
// The real field (tiptap + variable picker) is covered by google-ads-template-field.test.tsx.
vi.mock(
  "@/features/integration-google-ads/components/google-ads-template-field",
  () => ({
    GoogleAdsTemplateField: ({
      name,
      label,
      placeholder,
      deferError,
    }: {
      name: string
      label: string
      placeholder?: string
      deferError?: boolean
    }) => {
      const { control, setValue } = useFormContext()
      const value: string | undefined = useWatch({ control, name })
      return (
        <label>
          {label}
          <input
            data-defer-error={String(Boolean(deferError))}
            data-testid={`template-${name}`}
            onChange={(event) => setValue(name, event.target.value)}
            placeholder={placeholder}
            value={value ?? ""}
          />
        </label>
      )
    },
  }),
)

const { GoogleAdsCustomerMatching } = await import(
  "@/features/integration-google-ads/components/google-ads-customer-matching"
)

type Values = { matchEmail?: string; matchPhone?: string }
let form: UseFormReturn<Values>

const Host = ({
  defaults,
  isLegacyUpload,
  termsNotAccepted,
}: {
  defaults: Values
  isLegacyUpload: boolean
  termsNotAccepted: boolean
}) => {
  form = useForm<Values>({ defaultValues: defaults })
  return (
    <FormProvider {...form}>
      <GoogleAdsCustomerMatching
        emailName="matchEmail"
        isLegacyUpload={isLegacyUpload}
        phoneName="matchPhone"
        termsNotAccepted={termsNotAccepted}
      />
    </FormProvider>
  )
}

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
  act(() => root.unmount())
  container.remove()
})

const render = (
  defaults: Values = {},
  isLegacyUpload = false,
  termsNotAccepted = false,
) =>
  act(() => {
    root.render(
      <Host
        defaults={defaults}
        isLegacyUpload={isLegacyUpload}
        termsNotAccepted={termsNotAccepted}
      />,
    )
  })

const input = (name: string) =>
  container.querySelector<HTMLInputElement>(`[data-testid="template-${name}"]`)
const trigger = () => container.querySelector("button")

const TERMS_NOTE = "googleAds.conversionFields.customerMatchingTermsNotAccepted"

describe("GoogleAdsCustomerMatching terms note", () => {
  test("shows the note below both inputs when the data terms are not accepted", () => {
    render({ matchEmail: "{{email}}" }, false, true)

    const html = container.innerHTML
    expect(html).toContain(TERMS_NOTE)
    expect(html.indexOf(TERMS_NOTE)).toBeGreaterThan(
      html.indexOf('data-testid="template-matchPhone"'),
    )
  })

  test("shows no note when the terms are accepted", () => {
    render({ matchEmail: "{{email}}" }, false, false)

    expect(container.textContent).not.toContain(TERMS_NOTE)
  })

  test("shows no terms note on the legacy method, which cannot send identifiers anyway", () => {
    render({}, true, true)

    expect(container.textContent).not.toContain(TERMS_NOTE)
  })
})

describe("GoogleAdsCustomerMatching", () => {
  test("a step saved before the feature shows two empty inputs and writes nothing", () => {
    render()

    expect(input("matchEmail")?.value).toBe("")
    expect(input("matchPhone")?.value).toBe("")
    expect(form.getValues()).toEqual({})
    expect(form.formState.isDirty).toBe(false)
  })

  test("is collapsed while both are blank", () => {
    render({ matchEmail: "", matchPhone: "  " })

    expect(trigger()?.textContent).toBe(
      "googleAds.conversionFields.customerMatching",
    )
    expect(trigger()?.getAttribute("aria-expanded")).toBe("false")
  })

  test("opens and counts what is filled", () => {
    render({ matchEmail: "{{email}}", matchPhone: "{{phone}}" })

    expect(trigger()?.textContent).toContain(
      "googleAds.conversionFields.customerMatchingCount:2",
    )
    expect(trigger()?.getAttribute("aria-expanded")).toBe("true")
  })

  test("labels the two inputs and hints a variable, deferring their errors", () => {
    render({ matchEmail: "{{email}}" })

    expect(container.textContent).toContain(
      "googleAds.conversionFields.matchEmailLabel",
    )
    expect(container.textContent).toContain(
      "googleAds.conversionFields.matchPhoneLabel",
    )
    expect(input("matchEmail")?.placeholder).toBe(
      "googleAds.conversionFields.matchEmailPlaceholder",
    )
    expect(input("matchEmail")?.dataset.deferError).toBe("true")
  })

  test("typing writes the template to the form", () => {
    render({ matchEmail: "{{email}}" })

    act(() => {
      const element = input("matchPhone")
      if (element) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set
        setter?.call(element, "{{phone}}")
        element.dispatchEvent(new Event("input", { bubbles: true }))
      }
    })

    expect(form.getValues("matchPhone")).toBe("{{phone}}")
  })

  test("a legacy connection shows the notice instead of the inputs and keeps the values", () => {
    render({ matchEmail: "{{email}}" }, true)

    expect(container.textContent).toContain(
      "googleAds.conversionFields.customerMatchingLegacy",
    )
    expect(input("matchEmail")).toBeNull()
    expect(form.getValues("matchEmail")).toBe("{{email}}")
  })
})
