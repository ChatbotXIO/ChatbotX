"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { ImageIcon, ImageOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type DynamicImagePreviewPlaceholderProps = {
  hasError: boolean
}

export function DynamicImagePreviewPlaceholder(
  props: DynamicImagePreviewPlaceholderProps,
) {
  const { hasError } = props
  const t = useTranslations()

  if (!hasError) {
    return (
      <div className="flex min-h-25 items-center justify-center">
        <ImageIcon color="grey" size={25} />
      </div>
    )
  }

  return (
    <div className="flex min-h-25 items-center justify-center">
      <Tooltip>
        <TooltipTrigger render={<ImageOffIcon color="red" size={25} />} />
        <TooltipContent>
          <p>{t("dynamicImages.preview.error")}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
