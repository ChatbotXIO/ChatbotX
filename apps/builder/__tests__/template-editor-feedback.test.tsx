// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { IncludedAutomatically } from "@/features/templates/components/included-automatically"
import { TemplateForm } from "@/features/templates/components/template-form"
import { UninstalledNotice } from "@/features/templates/components/uninstalled-notice"

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
}))

vi.mock("next-intl", () => {
  const translate = (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
  translate.has = () => false
  return { useTranslations: () => translate }
})
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ storageUrl: "https://storage.test" }),
}))
vi.mock("@/features/templates/actions/save-template.action", () => ({
  saveTemplateAction: Object.assign(mocks.save, {
    bind: () => mocks.save,
  }),
}))
vi.mock("@/features/templates/components/template-contents-card", () => ({
  TemplateContentsCard: () => null,
}))
vi.mock("@/features/templates/components/template-cover-image-field", () => ({
  TemplateCoverImageField: () => null,
}))
vi.mock("@/features/templates/components/template-share-card", () => ({
  TemplateShareCard: () => null,
}))

const counts = {
  deleted: 4,
  deletedModified: 0,
  deletedUnverified: 0,
  keptModified: 0,
  keptShared: 0,
  keptByPolicy: 0,
  keptHasDependents: 0,
  keptPartlyRemoved: 0,
  keptLockedByOther: 0,
  blockedByReference: 0,
  absent: 0,
  failed: 0,
}

describe("template editor feedback", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.save.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("the completed uninstall notice states what was deleted in the past tense", () => {
    act(() =>
      root.render(
        <UninstalledNotice counts={counts} uninstalledBy="installer" />,
      ),
    )
    expect(container.textContent).toContain("deletedDone")
    expect(container.textContent).not.toContain('"deleted"')
  })

  test("the automatically included list names each row", () => {
    act(() =>
      root.render(
        <IncludedAutomatically
          category="flows"
          dependencies={{
            includedDependencies: [
              { category: "flows", sourceId: "1", name: "Welcome flow" },
              { category: "flows", sourceId: "2", name: "Follow-up" },
            ],
            manifests: [],
            droppedReferenceCount: 0,
          }}
        />,
      ),
    )
    expect(container.textContent).toContain("Welcome flow")
    expect(container.textContent).toContain("Follow-up")
  })

  test("submitting an empty name shows a field error instead of doing nothing", async () => {
    act(() =>
      root.render(<TemplateForm selectableCategories={[]} workspaceId="1" />),
    )
    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )
    expect(submit?.disabled).toBe(false)
    act(() => {
      submit?.click()
    })
    await act(() => Promise.resolve())
    expect(mocks.save).not.toHaveBeenCalled()
    const nameInput =
      container.querySelector<HTMLInputElement>('input[name="name"]')
    expect(nameInput?.getAttribute("aria-invalid")).toBe("true")
  })
})
