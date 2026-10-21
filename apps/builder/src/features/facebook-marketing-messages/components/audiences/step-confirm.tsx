"use client"

import type { AudienceUploadResult } from "@chatbotx.io/business/facebook-marketing-message-audience"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { CheckIcon, InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export function StepConfirm({
  result,
  onDone,
}: {
  result: AudienceUploadResult
  onDone: () => void
}) {
  const t = useTranslations("facebookMarketingMessages.audiences.wizard")

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-green-100">
        <div className="flex size-9 items-center justify-center rounded-full bg-green-500 text-white">
          <CheckIcon className="size-5" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{t("successTitle")}</p>
        <p className="text-muted-foreground text-sm">
          {t("successRows", { count: result.received })}
        </p>
        {result.skipped > 0 && (
          <p className="text-muted-foreground text-sm">
            {t("skippedRows", { count: result.skipped })}
          </p>
        )}
        {result.invalid > 0 && (
          <p className="text-muted-foreground text-sm">
            {t("invalidRows", { count: result.invalid })}
          </p>
        )}
      </div>
      <Alert className="text-left">
        <InfoIcon className="size-4" />
        <AlertDescription>{t("matchingNote")}</AlertDescription>
      </Alert>
      <Button onClick={onDone} type="button">
        {t("done")}
      </Button>
    </div>
  )
}
