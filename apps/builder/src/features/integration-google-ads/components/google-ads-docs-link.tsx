import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"

const SEND_EVENTS_DOCS =
  "https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events"

/** Points to Google's reference instead of explaining its fields in the form. */
export const GoogleAdsDocsLink = () => {
  const t = useTranslations()
  return (
    <a
      className="inline-flex w-fit items-center gap-0.5 text-muted-foreground text-xs underline underline-offset-2"
      href={SEND_EVENTS_DOCS}
      rel="noopener noreferrer"
      target="_blank"
    >
      {t("googleAds.conversionFields.learnMore")}
      <ExternalLinkIcon
        aria-hidden="true"
        className="size-3 rtl:-scale-x-100"
      />
    </a>
  )
}
