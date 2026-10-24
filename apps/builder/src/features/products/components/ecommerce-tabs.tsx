"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { AppTab } from "@/components/app-tab"

/**
 * The e-commerce layout is a Server Component, so the active tab has to be
 * decided here — every route under the group shares that one layout, and a
 * hardcoded flag would keep Products highlighted on the other tabs.
 */
export function EcommerceTabs({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const pathname = usePathname()
  const base = `/space/${workspaceId}`

  const tabs = [
    { label: t("products.title"), href: `${base}/products` },
    { label: t("orders.title"), href: `${base}/orders` },
    { label: t("discountCodes.title"), href: `${base}/discount-codes` },
    { label: t("productVendors.title"), href: `${base}/product-vendors` },
    { label: t("productCategories.title"), href: `${base}/product-categories` },
    { label: t("settings.title"), href: `${base}/ecommerce-settings` },
    {
      label: t("ecommerceAnalytics.title"),
      href: `${base}/ecommerce-analytics`,
    },
  ]

  return (
    <AppTab
      tabs={tabs.map((tab) => ({
        ...tab,
        isActive: pathname.startsWith(tab.href),
      }))}
    />
  )
}
