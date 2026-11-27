// @vitest-environment jsdom

import { Form } from "@chatbotx.io/ui/components/ui/form"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { useForm } from "react-hook-form"
import { describe, expect, test, vi } from "vitest"
import {
  CustomFieldDraftInput,
  CustomFieldValueInput,
} from "@/features/custom-fields/components/custom-field-value-input"

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))

function Host({
  type,
  value = "",
  required,
  maxLength,
}: {
  type: CustomFieldType
  value?: string
  required?: boolean
  maxLength?: number
}) {
  const form = useForm({ defaultValues: { v: value } })
  return (
    <Form {...form}>
      <CustomFieldValueInput
        maxLength={maxLength}
        name="v"
        required={required}
        type={type}
      />
    </Form>
  )
}

function mount(node: React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { container, unmount: () => act(() => root.unmount()) }
}

describe("CustomFieldValueInput", () => {
  test.each([
    ["shortText", "input[type=text], input:not([type])"],
    ["longText", "textarea"],
    ["email", "input[type=email]"],
    ["phoneNumber", "input[type=tel]"],
    ["number", "input[type=number]"],
    ["boolean", "[role=checkbox]"],
    ["date", "button"],
    ["datetime", "button"],
  ] as const)("renders the %s control", (type, selector) => {
    const { container, unmount } = mount(<Host type={type} />)
    expect(container.querySelector(selector)).not.toBeNull()
    unmount()
  })

  test("a stored boolean shows as checked", () => {
    const { container, unmount } = mount(<Host type="boolean" value="true" />)
    expect(
      container.querySelector("[role=checkbox]")?.getAttribute("aria-checked"),
    ).toBe("true")
    unmount()
  })
})

describe("CustomFieldValueInput limits and clearing", () => {
  test("text has no length cap unless the caller sets one", () => {
    const free = mount(<Host type="longText" />)
    expect(
      free.container.querySelector("textarea")?.hasAttribute("maxlength"),
    ).toBe(false)
    free.unmount()
    const capped = mount(<Host maxLength={5000} type="longText" />)
    expect(
      capped.container.querySelector("textarea")?.getAttribute("maxlength"),
    ).toBe("5000")
    capped.unmount()
  })

  test("an optional date can be cleared back to empty; a required one has no clear", () => {
    const edits: string[] = []
    const optional = mount(
      <CustomFieldDraftInput
        onChange={(next) => edits.push(next)}
        type="date"
        value="2026-05-20"
      />,
    )
    const clear = Array.from(
      optional.container.querySelectorAll("button"),
    ).find((button) => button.textContent === "clear")
    act(() => clear?.click())
    expect(edits.at(-1)).toBe("")
    optional.unmount()

    const required = mount(<Host required type="date" value="2026-05-20" />)
    expect(
      Array.from(required.container.querySelectorAll("button")).some(
        (button) => button.textContent === "clear",
      ),
    ).toBe(false)
    required.unmount()
  })
})

describe("CustomFieldDraftInput", () => {
  test("shows the value and reports edits", () => {
    const edits: string[] = []
    const { container, unmount } = mount(
      <CustomFieldDraftInput
        onChange={(next) => edits.push(next)}
        type="shortText"
        value="hello"
      />,
    )
    const input = container.querySelector("input") as HTMLInputElement
    expect(input.value).toBe("hello")
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    act(() => {
      setter?.call(input, "bye")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(edits.at(-1)).toBe("bye")
    unmount()
  })

  test("follows an external reset of the value", () => {
    const { container, unmount } = mount(
      <CustomFieldDraftInput
        onChange={() => undefined}
        type="shortText"
        value="a"
      />,
    )
    expect((container.querySelector("input") as HTMLInputElement).value).toBe(
      "a",
    )
    unmount()
  })
})
