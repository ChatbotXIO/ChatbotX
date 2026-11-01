// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { StepStoreProvider } from "../../../stores/step-store-provider"
import { PhoneNumberField } from "../phone-number-field"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "en",
}))

const editor = vi.hoisted(() => ({
  type: (_text: string): void => undefined,
}))

vi.mock("@/components/tiptap/plain-text-tiptap-editor", () => ({
  PlainTextTiptapEditor: ({
    initValue,
    onChange,
    editorAttributes,
  }: {
    initValue?: string
    onChange?: (text: string) => void
    editorAttributes?: Record<string, string>
  }) => {
    editor.type = (text) => onChange?.(text)
    return (
      <input
        data-testid="phone-editor"
        readOnly
        value={initValue ?? ""}
        {...editorAttributes}
      />
    )
  },
}))

type FormValues = { phoneNumber: string }

let container: HTMLDivElement
let root: Root
let form: UseFormReturn<FormValues> | undefined

const Harness = ({ initialValue }: { initialValue: string }) => {
  form = useForm<FormValues>({ defaultValues: { phoneNumber: initialValue } })
  return (
    <FormProvider {...form}>
      <PhoneNumberField label="Phone number" name="phoneNumber" />
    </FormProvider>
  )
}

const renderField = (
  initialValue: string,
  workspaceTargetCountry: string | null,
) => {
  act(() => {
    root.render(
      <StepStoreProvider initialState={{ workspaceTargetCountry }}>
        <Harness initialValue={initialValue} />
      </StepStoreProvider>,
    )
  })
  return form?.getValues("phoneNumber")
}

const typeNumber = (text: string) => {
  act(() => {
    editor.type(text)
  })
}

const failValidation = () => {
  act(() => {
    form?.setError("phoneNumber", { message: "invalidPhoneNumber" })
  })
}

const phoneEditor = () =>
  container.querySelector<HTMLInputElement>('[data-testid="phone-editor"]')
const shownNumber = () => phoneEditor()?.value
const countryTrigger = () =>
  container.querySelector<HTMLButtonElement>(
    'button[aria-label="flows.callPhoneNumber.countryLabel"]',
  )

// cmdk scrolls the active option into view; jsdom has no layout.
Element.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  form = undefined
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe("PhoneNumberField workspace default", () => {
  test.each([
    ["US", "+1"],
    ["DE", "+49"],
    ["JP", "+81"],
  ])("picks the workspace country %s for a new number without writing a value", (country, dialCode) => {
    expect(renderField("", country)).toBe("")
    expect(countryTrigger()?.textContent).toContain(dialCode)
  })

  test.each([
    ["unknown", "unknown"],
    ["not set", null],
    ["not a country code", "XX"],
  ])("picks no country when the workspace country is %s", (_name, country) => {
    renderField("", country)
    expect(countryTrigger()?.textContent?.trim()).toBe("+")
  })

  test.each([
    ["GB", "+442079460958", "+44", "2079460958"],
    ["BR", "+5511987654321", "+55", "11987654321"],
    ["CA", "+16135550123", "+1", "6135550123"],
  ])("shows a saved %s number as its national part next to its country", (_country, saved, dialCode, national) => {
    expect(renderField(saved, "US")).toBe(saved)
    expect(countryTrigger()?.textContent).toContain(dialCode)
    expect(shownNumber()).toBe(national)
  })

  test("shows a non-geographic number whole, with no country", () => {
    renderField("+80012345678", "US")
    expect(shownNumber()).toBe("+80012345678")
    expect(countryTrigger()?.textContent?.trim()).toBe("+")
  })
})

describe("PhoneNumberField typing", () => {
  test.each([
    ["+14155552671", "+1", "4155552671"],
    ["+442079460958", "+44", "2079460958"],
    ["+81312345678", "+81", "312345678"],
  ])("moves a complete number %s into the picker", (typed, dialCode, national) => {
    renderField("", null)
    typeNumber(typed)

    expect(form?.getValues("phoneNumber")).toBe(typed)
    expect(countryTrigger()?.textContent).toContain(dialCode)
    expect(shownNumber()).toBe(national)
  })

  test("leaves a number still being typed as typed", () => {
    renderField("", null)
    typeNumber("+4420")

    expect(form?.getValues("phoneNumber")).toBe("+4420")
    expect(countryTrigger()?.textContent?.trim()).toBe("+")
  })

  test("follows a number dialled internationally from the picked country", () => {
    renderField("", "US")
    typeNumber("011 44 20 7946 0958")

    expect(form?.getValues("phoneNumber")).toBe("+442079460958")
    expect(countryTrigger()?.textContent).toContain("+44")
    expect(shownNumber()).toBe("2079460958")
  })

  test.each([
    ["GB", "020 7946 0958", "+442079460958"],
    ["DE", "015123456789", "+4915123456789"],
    ["IN", "98765 43210", "+919876543210"],
  ])("joins a %s national number with the picked country", (country, typed, stored) => {
    renderField("", country)
    typeNumber(typed)

    expect(form?.getValues("phoneNumber")).toBe(stored)
  })
})

describe("PhoneNumberField country picker", () => {
  test.each([
    ["empty", ""],
    ["a national number", "020 7946 0958"],
    ["an international number", "+1 415 555 2671"],
  ])("is enabled for %s", (_name, value) => {
    renderField(value, null)
    expect(countryTrigger()?.disabled).toBe(false)
  })

  test.each([
    ["a variable", "{{contact.phone}}"],
    ["a tel: link", "tel:+14155552671"],
    ["free text", "call me"],
  ])("is disabled for %s", (_name, value) => {
    renderField(value, null)
    expect(countryTrigger()?.disabled).toBe(true)
  })

  test("searching a dial code and picking the country joins a national number", () => {
    renderField("020 7946 0958", null)

    act(() => {
      countryTrigger()?.click()
    })
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="actions.search"]',
    )
    if (!search) {
      throw new Error("expected the country search input")
    }
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "+44")
      search.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const firstMatch = document.querySelector<HTMLElement>("[cmdk-item]")
    expect(firstMatch?.textContent).toContain("+44")

    act(() => {
      firstMatch?.click()
    })

    expect(form?.getValues("phoneNumber")).toBe("+442079460958")
    expect(countryTrigger()?.textContent).toContain("+44")
    expect(shownNumber()).toBe("2079460958")
  })
})

describe("PhoneNumberField errors", () => {
  test("explains an invalid number for the picked country", () => {
    renderField("", "DE")
    typeNumber("123123123123123")
    failValidation()

    expect(container.textContent).toContain(
      'flows.callPhoneNumber.invalidForCountry:{"country":"Germany"}',
    )
  })

  test("asks for a country when a national number has none", () => {
    renderField("", null)
    typeNumber("2079460958")
    failValidation()

    expect(container.textContent).toContain(
      "flows.callPhoneNumber.needsCountry",
    )
  })

  test("explains an invalid international number", () => {
    renderField("", null)
    typeNumber("+999123")
    failValidation()

    expect(container.textContent).toContain(
      "flows.callPhoneNumber.invalidInternational",
    )
  })

  test("points the label and the error at the editable field", () => {
    renderField("", null)
    failValidation()

    const label = container.querySelector("label")
    const input = phoneEditor()
    expect(label?.getAttribute("for")).toBe(input?.id)
    expect(input?.getAttribute("aria-invalid")).toBe("true")
    const describedBy = input?.getAttribute("aria-describedby") ?? ""
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "flows.callPhoneNumber.needsCountry",
    )
  })
})
