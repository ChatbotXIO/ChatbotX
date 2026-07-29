"use client"

import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useMemo } from "react"
import { replaceCouponVariableTokensWithLabels } from "@/components/tiptap/extensions/variable-injection/mention"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { ButtonGroupViewer } from "../button/viewer"

type SendTextStepViewerProps = {
  data: SendTextStepSchema
}

const SendTextStepViewer = (props: SendTextStepViewerProps) => {
  const { data } = props
  const { labelById } = useCouponTopicOptions()
  const previewText = useMemo(
    () => replaceCouponVariableTokensWithLabels(data.text, labelById),
    [data.text, labelById],
  )

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="whitespace-pre-line bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          {previewText}
        </p>
        {data.buttons.length > 0 && <ButtonGroupViewer data={data.buttons} />}
      </CardContent>
    </Card>
  )
}

export default SendTextStepViewer
