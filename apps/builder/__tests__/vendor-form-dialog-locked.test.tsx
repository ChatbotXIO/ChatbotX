// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { LockedEditorProvider } from "@/features/templates/components/locked-editor"
import messages from "../messages/en.json"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock(
  "@/features/products/provider/use-invalidate-product-form-options",
  () => ({ useInvalidateProductFormOptions: () => vi.fn() }),
)
vi.mock(
  "@/features/product-vendors/actions/update-product-vendor.action",
  () => ({
    updateProductVendorAction: { bind: () => vi.fn() },
  }),
)
vi.mock(
  "@/features/product-vendors/actions/create-product-vendor.action",
  () => ({
    createProductVendorAction: { bind: () => vi.fn() },
  }),
)
vi.mock(
  "@/features/ecommerce-open-hours/components/open-hours-select-field",
  () => ({ ALWAYS_OPEN: "always", OpenHoursSelectField: () => null }),
)
vi.mock("@/features/ecommerce-settings/components/rank-select-field", () => ({
  DEFAULT_RANK: 3,
  RankSelectField: () => null,
}))
vi.mock("@/features/ecommerce-settings/components/single-image-field", () => ({
  SingleImageField: () => null,
}))

const { VendorFormDialog } = await import(
  "@/features/product-vendors/components/vendor-form-dialog"
)

const vendor = {
  id: "7",
  name: "Acme",
  shortDescription: "",
  phone: "",
  storeAddress: "",
  imageUrl: "",
  discountPercent: 0,
  minimumOrderValue: 0,
  openHoursId: null,
  rank: 3,
  categoryId: null,
  subcategoryId: null,
} as unknown as Parameters<typeof VendorFormDialog>[0]["vendor"]

describe("vendor edit dialog on a View-only template copy", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (locked: boolean) => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <LockedEditorProvider locked={locked}>
            <VendorFormDialog
              categories={[]}
              hideTrigger
              onOpenChange={vi.fn()}
              open
              openHours={[]}
              vendor={vendor}
              workspaceId="2"
            />
          </LockedEditorProvider>
        </NextIntlClientProvider>,
      )
    })
  }

  const button = (label: string) =>
    Array.from(document.body.querySelectorAll("button")).find(
      (el) => (el.textContent ?? "").trim() === label,
    ) as HTMLButtonElement

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("locked: Save disabled, Cancel enabled", () => {
    render(true)
    expect(button(messages.productVendors.save).disabled).toBe(true)
    expect(button(messages.productVendors.cancel).disabled).toBe(false)
  })

  test("unlocked: Save enabled", () => {
    render(false)
    expect(button(messages.productVendors.save).disabled).toBe(false)
  })
})
