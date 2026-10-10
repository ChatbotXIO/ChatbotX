"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

/** Read-only public link with a copy button, shown at the bottom of an edit page. */
export function PublicUrlSection({
  publicUrl,
  label,
  hint,
}: {
  publicUrl: string
  label: string
  hint: string
}) {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()

  const handleCopy = () => {
    copy(publicUrl)
      .then(() => {
        toast.success(t("messages.copiedToClipboard"))
      })
      .catch(() => {
        toast.error(t("messages.copyFailed"))
      })
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <p className="flex-none font-medium text-sm">{label}</p>
        <Input className="min-w-0 max-w-md" readOnly value={publicUrl} />
        <Button
          aria-label={t("actions.copyUrl")}
          onClick={handleCopy}
          size="icon"
          type="button"
          variant="secondary"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  )
}
