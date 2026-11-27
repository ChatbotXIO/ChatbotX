"use client"

import { useMemo } from "react"
import { replaceCouponVariableTokensWithLabels } from "@/components/tiptap/extensions/variable-injection/mention"
import { useBotFieldTokenLabels } from "@/components/tiptap/use-bot-field-token-labels"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"

/** An image or video step's caption, previewed like a `sendText` step's text. */
export const MediaCaptionViewer = ({ caption }: { caption: string }) => {
  const { labelById } = useCouponTopicOptions()
  const couponSubstituted = useMemo(
    () => replaceCouponVariableTokensWithLabels(caption, labelById),
    [caption, labelById],
  )
  const previewText = useBotFieldTokenLabels(couponSubstituted)

  return (
    <p className="wrap-anywhere whitespace-pre-line bg-gray-200 px-4 py-2 dark:bg-neutral-600">
      {previewText}
    </p>
  )
}
