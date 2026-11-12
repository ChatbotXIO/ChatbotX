import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { HomeTemplatesPanel } from "@/features/workspaces/components/home-templates-panel"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
      href: "/t/template?id=11&key=tok",
      categoryIds: ["5"],
    },
  ],
}

let container: HTMLDivElement | null = null
let root: Root | null = null

const render = (
  props: Parameters<typeof HomeTemplatesPanel>[0],
): HTMLDivElement => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<HomeTemplatesPanel {...props} />)
  })
  return container
}

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

  test("says why the catalog is missing when the store could not be read", () => {
    const el = render({ panel: "failed", catalog: null })

    expect(el.querySelector('[role="alert"]')?.textContent).toBe("loadFailed")
    expect(el.querySelector('[data-testid="store-catalog"]')).toBeNull()
  })

  test("renders nothing when there is no panel", () => {
    const el = render({ panel: "none", catalog: null })

    expect(el.innerHTML).toBe("")
  })

  test("renders nothing, not a broken catalog, when told to show one it was not given", () => {
    const el = render({ panel: "catalog", catalog: null })

    expect(el.innerHTML).toBe("")
  })
})
