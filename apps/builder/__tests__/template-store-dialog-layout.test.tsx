import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { noop } = vi.hoisted(() => ({
  noop: () => {
    // intentionally empty: stands in for callbacks and jsdom gaps
  },
}))

class ResizeObserverStub {
  observe = noop
  unobserve = noop
  disconnect = noop
}

globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= noop

/** Echoes the key and its values so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: noop }) }))
vi.mock("sonner", () => ({ toast: { success: noop, error: noop } }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: noop, isPending: false }),
}))
vi.mock("@/lib/errors/safe-action-error-handler", () => ({
  toastActionError: () => noop,
}))
vi.mock("@/i18n/config", () => ({
  localeMeta: new Proxy({}, { get: (_, locale) => ({ nativeLabel: locale }) }),
}))
vi.mock("@/features/template-store/template-store.action", () => ({
  addTemplateStoreListingAction: vi.fn(),
  updateTemplateStoreListingAction: vi.fn(),
  searchTemplateStoreCandidatesAction: vi.fn(),
}))

import { ListingFormDialog } from "@/features/template-store/components/listing-form-dialog"
import { TemplatePicker } from "@/features/template-store/components/template-picker"

const LONG_TEMPLATE_NAME =
  "A very long template name that cannot possibly fit on one line of the Add dialog"

const categories = ["a", "b", "c", "d", "e"].map((id) => ({
  id,
  name: `Category ${id}`,
}))

describe("template store dialog layout", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("the listing dialog sizes its grid track to the dialog, not to its widest child", () => {
    act(() => {
      root.render(
        <ListingFormDialog
          categories={categories}
          listing={{
            listingId: "1",
            templateId: "2",
            name: LONG_TEMPLATE_NAME,
            categoryIds: categories.map((category) => category.id),
            languages: [],
          }}
          onOpenChange={noop}
          open
          scope="platform"
        />,
      )
    })

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.className.split(" ")).toEqual(
      expect.arrayContaining(["grid-cols-[minmax(0,1fr)]", "sm:max-w-lg"]),
    )
  })

  test("the categories chip for the hidden selections is translated", () => {
    act(() => {
      root.render(
        <ListingFormDialog
          categories={categories}
          listing={{
            listingId: "1",
            templateId: "2",
            name: "Starter",
            categoryIds: categories.map((category) => category.id),
            languages: [],
          }}
          onOpenChange={noop}
          open
          scope="platform"
        />,
      )
    })

    expect(document.body.textContent).toContain('moreSelected:{"count":2}')
  })

  test("the template picker keeps a long name on one truncated line and shows it in full on hover", () => {
    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <TemplatePicker
            onChange={noop}
            scope="platform"
            value={{ templateId: "2", name: LONG_TEMPLATE_NAME } as never}
          />
        </QueryClientProvider>,
      )
    })

    const label = container.querySelector("span.truncate")
    expect(label?.textContent).toBe(LONG_TEMPLATE_NAME)
    expect(label?.getAttribute("title")).toBe(LONG_TEMPLATE_NAME)
  })
})
