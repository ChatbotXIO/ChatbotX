// @vitest-environment jsdom

import "./helpers/tiptap-jsdom-shims"
import { act } from "react"
import {
  FormProvider,
  type Resolver,
  type ResolverResult,
  type UseFormReturn,
  useForm,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { GoogleAdsTemplateField } from "@/features/integration-google-ads/components/google-ads-template-field"
import { type Mounted, mount } from "./helpers/google-ads-ui"
import { settle, typeInto } from "./helpers/tiptap-jsdom"

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.has = (key: string) => key.startsWith("errors.")
    return t
  },
}))

// The picker's option source (react-query / zustand stores) is data, not
// behaviour under test; the editor and its picker markup are the real ones.
vi.mock("@/components/tiptap/use-prompt-variable-options", () => ({
  usePromptVariableOptions: () => [
    { label: "Amount", value: "amount", group: "Fields" },
  ],
}))

/** Resolver invocations react-hook-form makes for one field blur in onBlur mode. */
const BLURS_RESOLVER_CALLS = 1

type Values = { value: string }

const resolve = vi.fn<Resolver<Values>>((values) => {
  const result: ResolverResult<Values> = values.value
    ? { values, errors: {} }
    : {
        values: {},
        errors: { value: { type: "required", message: "errors.required" } },
      }
  return Promise.resolve(result)
})

let formRef: UseFormReturn<Values>

const Harness = ({ initial }: { initial: string }) => {
  const form = useForm<Values>({
    mode: "onBlur",
    defaultValues: { value: initial },
    resolver: resolve,
  })
  formRef = form
  return (
    <FormProvider {...form}>
      <GoogleAdsTemplateField
        description="helper text"
        label="Value"
        name="value"
        placeholder="Amount"
        required
      />
      <button data-testid="outside" type="button">
        outside
      </button>
    </FormProvider>
  )
}

let host: Mounted

const editable = () =>
  host.container.querySelector<HTMLElement>("[contenteditable]") as HTMLElement
const outside = () =>
  host.container.querySelector<HTMLElement>(
    '[data-testid="outside"]',
  ) as HTMLElement
const pickerTrigger = () =>
  host.container.querySelector<HTMLElement>(
    '[data-slot="popover-trigger"]',
  ) as HTMLElement
const pickerOption = () =>
  Array.from(
    host.container.querySelectorAll<HTMLElement>(
      '[data-slot="popover-content"] button',
    ),
  ).find((button) => button.textContent === "Amount") as HTMLElement
const text = () => editable().textContent
const focus = (element: HTMLElement) => act(() => element.focus())

const render = async (initial = "") => {
  host.render(<Harness initial={initial} />)
  await settle()
}

const openPicker = async () => {
  await act(async () => pickerTrigger().click())
  await settle()
}

beforeEach(() => {
  resolve.mockClear()
  host = mount()
})

afterEach(() => host.unmount())

describe("GoogleAdsTemplateField blur and validation", () => {
  test("validates on a real blur and shows the translated error as an alert", async () => {
    await render("")
    await focus(editable())
    expect(resolve).not.toHaveBeenCalled()

    await focus(outside())
    await settle()

    expect(resolve).toHaveBeenCalledTimes(BLURS_RESOLVER_CALLS)
    const alert = host.container.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe("errors.required")
  })

  test("opening the picker and choosing a variable never validates", async () => {
    await render("")
    await focus(editable())
    await openPicker()
    expect(pickerOption()).toBeTruthy()
    // The picker's DOM sits inside the field wrapper.
    expect(
      editable().closest("[data-slot=form-item]")?.contains(pickerOption()),
    ).toBe(true)

    await focus(pickerOption())
    await act(async () => pickerOption().click())
    await settle()

    expect(resolve).not.toHaveBeenCalled()
    expect(text()).toContain("{{amount}}")
  })

  test("focus moving from the picker to an outside button is exactly one blur", async () => {
    await render("")
    await focus(editable())
    await openPicker()
    await focus(pickerOption())
    expect(resolve).not.toHaveBeenCalled()

    await focus(outside())
    await settle()

    expect(resolve).toHaveBeenCalledTimes(BLURS_RESOLVER_CALLS)
  })
})

describe("GoogleAdsTemplateField accessibility", () => {
  test("the contenteditable is a named, described textbox that reflects errors", async () => {
    await render("")
    const box = editable()
    expect(box.getAttribute("role")).toBe("textbox")

    const nameOf = (element: HTMLElement) =>
      (element.getAttribute("aria-labelledby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent)
        .join(" ")
    expect(nameOf(box)).toContain("Value")
    const describedBy = () => box.getAttribute("aria-describedby") ?? ""
    expect(
      describedBy()
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent),
    ).toEqual(["helper text"])
    expect(box.getAttribute("aria-invalid")).toBe("false")

    await focus(box)
    await focus(outside())
    await settle()

    expect(editable().getAttribute("aria-invalid")).toBe("true")
    expect(
      describedBy()
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent),
    ).toEqual(["helper text", "errors.required"])
  })
})

describe("GoogleAdsTemplateField value sync", () => {
  test("an unfocused reset is applied immediately", async () => {
    await render("old")
    expect(text()).toBe("old")

    await act(async () => formRef.reset({ value: "fresh" }))
    await settle()

    expect(text()).toBe("fresh")
  })

  test("a reset back to the initial value still reaches the editor", async () => {
    await render("old")
    await typeInto(editable(), "edited")
    expect(formRef.getValues("value")).toBe("edited")

    await act(async () => formRef.reset({ value: "old" }))
    await settle()

    expect(text()).toBe("old")
  })

  test("a reset while focused is deferred until the real blur", async () => {
    await render("old")
    await focus(editable())

    await act(async () => formRef.reset({ value: "fresh" }))
    await settle()
    expect(text()).toBe("old")

    await focus(outside())
    await settle()
    expect(text()).toBe("fresh")
  })

  test("a reset issued after choosing a variable stays deferred through picker use, then applies on blur", async () => {
    await render("old")
    await focus(editable())
    await openPicker()
    await focus(pickerOption())
    await act(async () => pickerOption().click())
    await settle()
    expect(resolve).not.toHaveBeenCalled()
    expect(text()).toBe("old{{amount}}")
    expect(editable()).toBe(document.activeElement)

    await act(async () => formRef.reset({ value: "fresh" }))
    await openPicker()
    await focus(pickerOption())
    await settle()
    expect(resolve).not.toHaveBeenCalled()
    expect(text()).toBe("old{{amount}}")

    await focus(outside())
    await settle()
    expect(resolve).toHaveBeenCalledTimes(BLURS_RESOLVER_CALLS)
    expect(text()).toBe("fresh")
  })

  test("a deferred reset that is reverted while focused is dropped (editor and form agree)", async () => {
    await render("old")
    await focus(editable())
    await act(async () => formRef.reset({ value: "fresh" }))
    await settle()
    await act(async () => formRef.reset({ value: "old" }))
    await settle()

    await focus(outside())
    await settle()

    expect(text()).toBe("old")
    expect(formRef.getValues("value")).toBe("old")
  })

  test("an edit made after a deferred reset supersedes it (the form holds the edit)", async () => {
    await render("old")
    await focus(editable())
    await act(async () => formRef.reset({ value: "fresh" }))
    await typeInto(editable(), "typed")

    await focus(outside())
    await settle()

    expect(formRef.getValues("value")).toBe("typed")
    expect(text()).toBe("typed")
  })

  test("typing reaches the form without re-setting the editor", async () => {
    await render("")
    const before = editable()
    await focus(before)

    await typeInto(before, "12")
    expect(formRef.getValues("value")).toBe("12")
    await typeInto(editable(), "123")

    expect(formRef.getValues("value")).toBe("123")
    // Same DOM node: the editor was neither remounted nor re-seeded.
    expect(editable()).toBe(before)
    expect(text()).toBe("123")
  })

  test("the editor's own echo of the form value is not written back", async () => {
    await render("seed")
    const setValue = vi.spyOn(formRef, "setValue")
    const dirtyBefore = formRef.formState.isDirty

    await act(async () => formRef.reset({ value: "other" }))
    await settle()

    expect(text()).toBe("other")
    expect(formRef.getValues("value")).toBe("other")
    expect(setValue).not.toHaveBeenCalled()
    expect(formRef.formState.isDirty).toBe(dirtyBefore)
    expect(formRef.formState.dirtyFields.value).toBeUndefined()
  })
})
