// @vitest-environment node

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FormProvider, useForm } from "react-hook-form"
import { describe, expect, test, vi } from "vitest"
import en from "../messages/en.json"
import es from "../messages/es.json"

vi.mock("@/components/tiptap/tiptap-editor", () => ({
  TiptapEditor: () => <div />,
}))
vi.mock("@/components/tiptap/plain-text-tiptap-editor", () => ({
  PlainTextTiptapEditor: () => <div />,
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "workspace-1" }))
vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useCustomFieldSelectOptions: () => [],
  useInvalidateCustomFields: () => vi.fn(),
}))
vi.mock("@/features/custom-fields/create-custom-field", () => ({
  CreateCustomFieldDialog: () => null,
}))

const { FormOptionalLabelBridge } = await import(
  "@/components/form-optional-label-bridge"
)
const { PlainTextEditorField } = await import(
  "@/components/tiptap/plain-text-editor-field"
)
const { TiptapEditorField } = await import(
  "@/components/tiptap/tiptap-editor-field"
)
const { CustomFieldSelect } = await import(
  "@/features/custom-fields/custom-field-select"
)

const FormHarness = ({ children }: { children: ReactNode }) => {
  const form = useForm({ defaultValues: { name: "", body: "", field: "" } })
  return <FormProvider {...form}>{children}</FormProvider>
}

const render = (
  locale: "en" | "es",
  messages: typeof en | typeof es,
  children: ReactNode,
) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FormOptionalLabelBridge>
        <FormHarness>{children}</FormHarness>
      </FormOptionalLabelBridge>
    </NextIntlClientProvider>,
  )

describe("optional field marker follows the UI language", () => {
  test("shared form fields read it from FormOptionalLabelBridge", () => {
    expect(render("es", es, <InputField label="Name" name="name" />)).toContain(
      "(opcional)",
    )
    expect(render("en", en, <InputField label="Name" name="name" />)).toContain(
      "(optional)",
    )
  })

  test("PlainTextEditorField translates it", () => {
    const html = render(
      "es",
      es,
      <PlainTextEditorField label="Body" name="body" />,
    )
    expect(html).toContain("(opcional)")
    expect(html).not.toContain("(optional)")
  })

  test("TiptapEditorField translates it", () => {
    const html = render(
      "es",
      es,
      <TiptapEditorField label="Body" name="body" />,
    )
    expect(html).toContain("(opcional)")
    expect(html).not.toContain("(optional)")
  })

  test("CustomFieldSelect translates it", () => {
    const html = render(
      "es",
      es,
      <CustomFieldSelect label="Field" name="field" />,
    )
    expect(html).toContain("(opcional)")
    expect(html).not.toContain("(optional)")
  })
})
