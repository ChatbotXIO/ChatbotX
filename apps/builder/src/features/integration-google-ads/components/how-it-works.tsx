"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"

/** Small trigger revealing the three connect steps, so the row itself stays one sentence. */
export const HowItWorks = () => {
  const t = useTranslations()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            className="h-auto w-fit gap-1 p-0 text-xs"
            size="sm"
            type="button"
            variant="link"
          />
        }
      >
        <InfoIcon aria-hidden="true" className="size-3.5" />
        {t("googleAds.connect.howItWorks")}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
        <ol className="list-decimal space-y-1 ps-5">
          <li>{t("googleAds.connect.steps.signIn")}</li>
          <li>{t("googleAds.connect.steps.chooseAccount")}</li>
          <li>{t("googleAds.connect.steps.pickAction")}</li>
        </ol>
        <p className="text-muted-foreground text-xs">
          {t("googleAds.connect.scopes")}
        </p>
      </PopoverContent>
    </Popover>
  )
}
