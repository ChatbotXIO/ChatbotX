import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { CouponTabs } from "@/features/coupons/components/coupon-tabs"

type CouponsLayoutProps = {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}

export default async function CouponsLayout({
  children,
  params,
}: CouponsLayoutProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return (
    <div className="flex flex-col gap-4">
      <CouponTabs />
      {children}
    </div>
  )
}
