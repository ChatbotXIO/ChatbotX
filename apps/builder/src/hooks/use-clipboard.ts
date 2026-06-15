import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { toast } from "sonner"

type CopiedValue = string | null

type CopyFn = (text: string) => Promise<boolean>

export function useClipboard() {
  const [_, setCopiedText] = useState<CopiedValue>(null)
  const t = useTranslations()

  const handleCopy: CopyFn = useCallback(
    async (text) => {
      if (!navigator?.clipboard) {
        console.warn("Clipboard not supported")
        return false
      }

      // Try to save to clipboard then save it in the state if worked
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t("messages.copiedToClipboard"))
        setCopiedText(text)
        return true
      } catch (error) {
        console.warn("Copy failed", error)
        setCopiedText(null)
        return false
      }
    },
    [t],
  )

  return { handleCopy }
}
