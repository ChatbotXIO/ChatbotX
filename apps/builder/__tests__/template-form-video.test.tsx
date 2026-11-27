// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TemplateForm } from "@/features/templates/components/template-form"

vi.mock("next-intl", () => {
  const translate = (key: string) => key
  translate.has = () => false
  return { useTranslations: () => translate }
})
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ storageUrl: "https://storage.test" }),
}))
vi.mock("@/features/templates/actions/save-template.action", () => {
  const save = vi.fn()
  return { saveTemplateAction: Object.assign(save, { bind: () => save }) }
})
vi.mock("@/features/templates/components/template-contents-card", () => ({
  TemplateContentsCard: () => null,
}))
vi.mock("@/features/templates/components/template-cover-image-field", () => ({
  TemplateCoverImageField: () => null,
}))

const VIMEO = "https://vimeo.com/76979871"
const LEGACY_YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

describe("template form video field", () => {
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

  function renderForm(initialVideoSource?: string) {
    act(() =>
      root.render(
        <TemplateForm
          initialVideoSource={initialVideoSource}
          selectableCategories={[]}
          workspaceId="1"
        />,
      ),
    )
    return {
      field: container.querySelector<HTMLTextAreaElement>(
        'textarea[name="video.source"]',
      ),
      iframe: container.querySelector("iframe"),
    }
  }

  test.each([
    ["a Vimeo link", VIMEO],
    ["a legacy YouTube link", LEGACY_YOUTUBE],
  ])("prefills %s and shows the preview player", (_label, source) => {
    const { field, iframe } = renderForm(source)

    expect(field?.value).toBe(source)
    expect(iframe).not.toBeNull()
  })

  test("without a saved video the field is empty and there is no preview", () => {
    const { field, iframe } = renderForm()

    expect(field).not.toBeNull()
    expect(field?.value).toBe("")
    expect(iframe).toBeNull()
  })
})
