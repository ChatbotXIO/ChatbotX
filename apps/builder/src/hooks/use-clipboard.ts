"use client"

import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

export const useClipboard = () => {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()

  const handleCopy = (text: string) => () => {
    copy(text)
      .then(() => {
        toast.success(t("messages.copiedToClipboard"))
      })
      .catch(() => {
        toast.error(t("messages.copyFailed"))
      })
  }

  return { handleCopy }
}
