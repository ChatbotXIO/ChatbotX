"use client"

import { type CouponStepSchema, stepTypes } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { TicketPercentIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { BaseStepViewer } from "../base/viewer"

export function CouponActionViewer({ data }: { data: CouponStepSchema }) {
  const t = useTranslations()
  const { labelById } = useCouponTopicOptions()
  const typeLabel =
    data.stepType === stepTypes.enum.markCouponUsed
      ? t("flows.actions.markCouponUsed")
      : t("flows.actions.setUpCoupon")
  const topicLabel = data.topicId
    ? (labelById.get(data.topicId) ?? data.topicId)
    : t("actions.pleaseSelect")

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={TicketPercentIcon}
            title={t("coupons.tabs.topicCoupon")}
          />
          <div className="mt-1 grid gap-1 text-muted-foreground text-xs">
            <div>
              {t("fields.type.label")}: {typeLabel}
            </div>
            <div>
              {t("coupons.fields.topic")}: {topicLabel}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
