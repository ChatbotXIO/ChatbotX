import type { ComponentProps } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { HomeTemplatesPanel } from "@/features/workspaces/components/home-templates-panel"

const mocks = vi.hoisted(() => ({ installSectionFails: false }))

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))
vi.mock("@/features/template-store/components/store-catalog", () => ({
  StoreCatalog: ({
    layout,
    tenantName,
    templates,
  }: {
    layout?: string
    tenantName: string
    templates: unknown[]
  }) => (
    <div
      data-layout={layout}
      data-templates={templates.length}
      data-tenant={tenantName}
      data-testid="store-catalog"
    />
  ),
}))
// The real ones are async server components that read the database.
vi.mock("@/features/templates/components/public-template-card", () => ({
  PublicTemplateCard: ({
    headingTag,
    imageUrl,
    template,
  }: {
    headingTag?: string
    imageUrl: string
    template: { name: string }
  }) => (
    <div
      data-heading={headingTag}
      data-image={imageUrl}
      data-name={template.name}
      data-testid="template-card"
    />
  ),
}))
vi.mock("@/features/templates/components/public-install-section", () => ({
  InstallSection: ({
    shareToken,
    userId,
  }: {
    shareToken: string
    userId: string
  }) => {
    if (mocks.installSectionFails) {
      throw new Error("reading the user's workspaces failed")
    }
    return (
      <div
        data-share-token={shareToken}
        data-testid="install-section"
        data-user={userId}
      />
    )
  },
}))

type PanelProps = ComponentProps<typeof HomeTemplatesPanel>

const catalog = {
  tenantName: "Acme",
  categories: [{ id: "5", name: "Flows" }],
  templates: [
    {
      templateId: "11",
      name: "Welcome flow",
      publisherName: null,
      description: null,
      imageUrl: "/cover.png",
      href: "/?tab=templates&key=tok",
      categoryIds: ["5"],
    },
  ],
}

const openedTemplate = {
  template: { name: "Welcome flow" },
  shareToken: "tok-11",
  imageUrl: "https://files.test/cover.png",
} as unknown as NonNullable<PanelProps["openedTemplate"]>

let container: HTMLDivElement | null = null
let root: Root | null = null

const render = (props: Partial<PanelProps>): HTMLDivElement => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <HomeTemplatesPanel
        catalog={null}
        openedTemplate={null}
        panel="none"
        userId="user-1"
        {...props}
      />,
    )
  })
  return container
}

beforeEach(() => {
  mocks.installSectionFails = false
})

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

describe("HomeTemplatesPanel", () => {
  test("shows the store catalog in its embedded layout, with the tenant's data", () => {
    const el = render({ panel: "catalog", catalog })

    const stub = el.querySelector('[data-testid="store-catalog"]')
    expect(stub?.getAttribute("data-layout")).toBe("embedded")
    expect(stub?.getAttribute("data-tenant")).toBe("Acme")
    expect(stub?.getAttribute("data-templates")).toBe("1")
    expect(el.querySelector('[role="alert"]')).toBeNull()
  })

  test("an opened template shows its card and the workspace picker inside the tab, with a way back", () => {
    const el = render({ panel: "template", openedTemplate })

    const card = el.querySelector('[data-testid="template-card"]')
    expect(card?.getAttribute("data-name")).toBe("Welcome flow")
    expect(card?.getAttribute("data-image")).toBe(
      "https://files.test/cover.png",
    )
    // Under the home page's own h1.
    expect(card?.getAttribute("data-heading")).toBe("h2")
    const install = el.querySelector('[data-testid="install-section"]')
    expect(install?.getAttribute("data-share-token")).toBe("tok-11")
    expect(install?.getAttribute("data-user")).toBe("user-1")
    const back = el.querySelector('a[href="/?tab=templates"]')
    expect(back?.textContent).toBe("backToTemplates")
    expect(el.querySelector('[data-testid="store-catalog"]')).toBeNull()
  })

  test("a failing workspace picker says so in its place, and the template stays", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.installSectionFails = true

    const el = render({ panel: "template", openedTemplate })

    expect(el.querySelector('[data-testid="template-card"]')).not.toBeNull()
    expect(el.querySelector('a[href="/?tab=templates"]')).not.toBeNull()
    expect(el.querySelector('[role="alert"]')?.textContent).toBe(
      "templateStore.store.loadFailed",
    )
    expect(el.querySelector('[data-testid="install-section"]')).toBeNull()
  })

  test("an unknown or disabled template says so inside the tab, with a way back", () => {
    const el = render({ panel: "templateUnavailable" })

    expect(el.querySelector('[role="alert"]')?.textContent).toBe(
      "templatesPublicPage.invalidDescription",
    )
    expect(el.querySelector('a[href="/?tab=templates"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="install-section"]')).toBeNull()
  })

  test("says why the catalog is missing when the store could not be read", () => {
    const el = render({ panel: "failed" })

    expect(el.querySelector('[role="alert"]')?.textContent).toBe(
      "templateStore.store.loadFailed",
    )
    expect(el.querySelector('[data-testid="store-catalog"]')).toBeNull()
  })

  test("renders nothing when there is no panel", () => {
    expect(render({ panel: "none" }).innerHTML).toBe("")
  })

  test.each([
    { panel: "catalog" as const },
    { panel: "template" as const },
  ])("renders nothing, not a broken $panel panel, when its data is missing", ({
    panel,
  }) => {
    expect(render({ panel }).innerHTML).toBe("")
  })
})
