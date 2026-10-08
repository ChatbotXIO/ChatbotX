// @vitest-environment jsdom

import "./helpers/tiptap-jsdom-shims"
import { act } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import { PlainTextTiptapEditor } from "@/components/tiptap/plain-text-tiptap-editor"
import { type Mounted, mount } from "./helpers/google-ads-ui"
import { settle } from "./helpers/tiptap-jsdom"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/components/tiptap/use-prompt-variable-options", () => ({
  usePromptVariableOptions: () => [
    { label: "Amount", value: "amount", group: "Fields" },
  ],
}))

const Host = () => {
  const form = useForm({ defaultValues: { value: "hello" } })
  return (
    <FormProvider {...form}>
      <PlainTextEditorField
        label="Value"
        name="value"
        showEmojiPicker={false}
      />
    </FormProvider>
  )
}

/** Base UI / React generate ids per run; the structure is what is pinned. */
const stable = (html: string) =>
  html
    .replace(/_r_[0-9a-z]+_/g, "_r_ID_")
    .replace(/id="base-ui-[^"]+"/g, 'id="base-ui-ID"')

let host: Mounted

beforeEach(() => {
  host = mount()
})

afterEach(() => {
  host.unmount()
  document.body.innerHTML = ""
})

const openVariablePicker = async () => {
  await act(async () =>
    host.container
      .querySelector<HTMLElement>('[data-slot="popover-trigger"]')
      ?.click(),
  )
  await settle()
}

describe("PlainTextTiptapEditor existing hosts", () => {
  test("DOM is unchanged without editorAttributes / inlineVariablePicker", async () => {
    host.render(<Host />)
    await settle()
    await openVariablePicker()

    // The picker still portals out of the host (a sibling of the host in
    // <body>), exactly as before the two optional props existed.
    expect(host.container.querySelector('[data-slot="popover-content"]')).toBe(
      null,
    )
    const portaled = document.querySelector('[data-slot="popover-content"]')
    expect(portaled).not.toBeNull()
    expect(host.container.contains(portaled)).toBe(false)

    expect({
      host: stable(host.container.innerHTML),
      portal: stable(portaled?.outerHTML ?? ""),
    }).toMatchSnapshot()
  })

  test("the two props are opt-in: attributes land on the contenteditable and the picker stays local", async () => {
    host.render(
      <PlainTextTiptapEditor
        editorAttributes={{ "aria-invalid": "true", "data-probe": "x" }}
        initValue="hello"
        inlineVariablePicker
        showEmojiPicker={false}
      />,
    )
    await settle()
    const editable = host.container.querySelector("[contenteditable]")
    expect(editable?.getAttribute("aria-invalid")).toBe("true")
    expect(editable?.getAttribute("data-probe")).toBe("x")
    expect(editable?.className).toContain("tiptap-plain-text")

    await openVariablePicker()
    expect(
      host.container.querySelector('[data-slot="popover-content"]'),
    ).not.toBeNull()
  })
})
