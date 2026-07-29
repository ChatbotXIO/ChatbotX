"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { AppTab } from "@/components/app-tab"
import { useWorkspaceId } from "@/hooks/routing"

export function CouponTabs() {
  const t = useTranslations()
  const pathname = usePathname()
  const workspaceId = useWorkspaceId()

  const topicCouponPath = `/space/${workspaceId}/topic-coupons`
  const couponPath = `/space/${workspaceId}/coupons`

  return (
    <AppTab
      tabs={[
        {
          label: t("coupons.tabs.topicCoupon"),
          href: topicCouponPath,
          isActive: pathname.startsWith(topicCouponPath),
        },
        {
          label: t("coupons.tabs.coupon"),
          href: couponPath,
          isActive: pathname.startsWith(couponPath),
        },
      ]}
    />
  )
}
