import { useTranslations } from "next-intl"
import { useCallback } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

/**
 * Copies a broadcast id and confirms it with the shared "copied" toast, or
 * reports the shared "failed to copy" error when the clipboard refuses.
 */
export function useCopyBroadcastId(): (id: string) => void {
  const t = useTranslations()
  const [, copyToClipboard] = useCopyToClipboard()

  return useCallback(
    (id: string) => {
      copyToClipboard(id).then((copied) => {
        if (copied) {
          toast.success(t("messages.copiedToClipboard"))
        } else {
          toast.error(t("messages.copyFailed"))
        }
      })
    },
    [copyToClipboard, t],
  )
}
