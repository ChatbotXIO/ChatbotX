"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"

const ABOUT_HASHING_URL =
  "https://www.facebook.com/business/help/112061095610075"
const TEMPLATE_URL = "/templates/marketing-messages-audience.csv"
const MAIN = ["email", "phone"] as const
const MORE = [
  "madid",
  "fn",
  "ln",
  "ct",
  "st",
  "country",
  "zip",
  "dob",
  "doby",
  "gen",
] as const

function IdentifierGroup({
  label,
  keys,
}: {
  label: string
  keys: readonly (typeof MAIN)[number][] | readonly (typeof MORE)[number][]
}) {
  const t = useTranslations(
    "facebookMarketingMessages.audiences.wizard.identifiers",
  )
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{label}</p>
      <div className="flex flex-wrap gap-2">
        {keys.map((key) => (
          <Badge key={key} variant="outline">
            {t(key)}
          </Badge>
        ))}
      </div>
    </div>
  )
}

export function StepPrepare({ onNext }: { onNext: () => void }) {
  const t = useTranslations("facebookMarketingMessages.audiences.wizard")

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {t("prepareDescription")}{" "}
        <a
          className="text-primary underline"
          href={ABOUT_HASHING_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("aboutHashing")}
        </a>
      </p>
      <div>
        <Button
          nativeButton={false}
          render={
            <a download href={TEMPLATE_URL}>
              <DownloadIcon className="size-4" />
              {t("downloadTemplate")}
            </a>
          }
          size="sm"
        />
      </div>
      <IdentifierGroup keys={MAIN} label={t("mainIdentifiers")} />
      <IdentifierGroup keys={MORE} label={t("moreIdentifiers")} />
      <div className="flex justify-end">
        <Button onClick={onNext} type="button">
          {t("next")}
        </Button>
      </div>
    </div>
  )
}
