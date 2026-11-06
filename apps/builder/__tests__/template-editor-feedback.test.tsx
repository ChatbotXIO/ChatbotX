// @vitest-environment jsdom

import { act, type useTransition } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { IncludedAutomatically } from "@/features/templates/components/included-automatically"
import { TemplateForm } from "@/features/templates/components/template-form"
import { UninstalledNotice } from "@/features/templates/components/uninstalled-notice"

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  useTransition: vi.fn(),
  realUseTransition: undefined as unknown as typeof useTransition,
}))

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>()
  mocks.realUseTransition = react.useTransition
  return { ...react, useTransition: mocks.useTransition }
})

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
    mocks.useTransition.mockImplementation(mocks.realUseTransition)
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
          }}
        />,
      ),
    )
    expect(container.textContent).toContain("Welcome flow")
    expect(container.textContent).toContain("Follow-up")
  })

  test("the submit button stays busy while the page moves on after a save", () => {
    mocks.useTransition.mockReturnValue([true, vi.fn()])

    act(() =>
      root.render(<TemplateForm selectableCategories={[]} workspaceId="1" />),
    )

    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )
    expect(submit?.disabled).toBe(true)
    expect(submit?.querySelector(".animate-spin")).not.toBeNull()
  })

  test("lists what ships, not inboxes, which the installer picks", () => {
    act(() =>
      root.render(
        <IncludedAutomatically
          dependencies={{
            includedDependencies: [],
            manifests: [
              { kind: "tags", count: 1, names: ["VIP"] },
              { kind: "inboxes", count: 1, names: ["Sales inbox"] },
            ],
          }}
          excludeKinds={new Set()}
        />,
      ),
    )

    expect(container.textContent).toContain("VIP")
    expect(container.textContent).not.toContain("Sales inbox")
  })

  test("a new template starts with editing on and deleting off", () => {
    act(() =>
      root.render(<TemplateForm selectableCategories={[]} workspaceId="1" />),
    )

    const [editSwitch, deleteSwitch] = Array.from(
      container.querySelectorAll('[role="switch"]'),
    )
    expect(container.textContent).toContain("templates.form.allowEdit")
    expect(editSwitch?.getAttribute("aria-checked")).toBe("true")
    expect(deleteSwitch?.getAttribute("aria-checked")).toBe("false")
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
