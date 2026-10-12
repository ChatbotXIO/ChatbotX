"use client"

import type { SendViewCatalogStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { StoreIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { replaceCouponVariableTokensWithLabels } from "@/components/tiptap/extensions/variable-injection/mention"
import { useBotFieldTokenLabels } from "@/components/tiptap/use-bot-field-token-labels"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"

type SendViewCatalogStepViewerProps = {
  data: SendViewCatalogStepSchema
}

const SendViewCatalogStepViewer = (props: SendViewCatalogStepViewerProps) => {
  const { data } = props
  const t = useTranslations()
  const { labelById } = useCouponTopicOptions()
  const bodyText = useBotFieldTokenLabels(
    useMemo(
      () => replaceCouponVariableTokensWithLabels(data.text, labelById),
      [data.text, labelById],
    ),
  )
  const footerText = useBotFieldTokenLabels(
    useMemo(
      () => replaceCouponVariableTokensWithLabels(data.footer, labelById),
      [data.footer, labelById],
    ),
  )

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="line-clamp-6 whitespace-pre-line break-words bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          {bodyText}
        </p>
        {footerText && (
          <p className="line-clamp-2 whitespace-pre-line break-words bg-gray-200 px-4 pb-2 text-muted-foreground text-xs dark:bg-neutral-600">
            {footerText}
          </p>
        )}
        <div className="flex items-center justify-center gap-1.5 border-border border-t bg-gray-100 px-4 py-2 text-center font-medium text-sm dark:bg-neutral-700">
          <StoreIcon aria-hidden className="size-3.5" />
          {t("flows.actions.sendViewCatalog")}
        </div>
      </CardContent>
    </Card>
  )
}

export default SendViewCatalogStepViewer
