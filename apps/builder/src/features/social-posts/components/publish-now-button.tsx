"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon, SendIcon } from "lucide-react"
import { useTranslations } from "next-intl"

/** "Publish now": saves the post and publishes every destination in one call. */
export const PublishNowButton = ({
  disabled,
  isPending,
  onPublish,
}: {
  disabled: boolean
  isPending: boolean
  onPublish: () => void
}) => {
  const t = useTranslations()
  return (
    <Button disabled={disabled || isPending} onClick={onPublish} type="button">
      {isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
      {t("composer.publishNow")}
    </Button>
  )
}
