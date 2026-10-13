"use client"

import type { SendProductsStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { ShoppingCartIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { SendProductsSummary } from "./components/send-products-summary"

type SendProductsStepViewerProps = {
  data: SendProductsStepSchema
}

const SendProductsStepViewer = ({ data }: SendProductsStepViewerProps) => {
  const t = useTranslations()

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="flex flex-col items-center gap-0.5 bg-gray-100 px-4 py-3 text-center dark:bg-neutral-700">
        <span className="flex items-center gap-1.5 font-medium text-sm">
          <ShoppingCartIcon aria-hidden className="size-4 text-amber-500" />
          {t("flows.actions.sendProducts")}
        </span>
        <span className="text-muted-foreground text-xs">
          <SendProductsSummary step={data} />
        </span>
      </CardContent>
    </Card>
  )
}

export default SendProductsStepViewer
