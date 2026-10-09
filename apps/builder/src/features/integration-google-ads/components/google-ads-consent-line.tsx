"use client"

import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

/**
 * Shown only when the saved workspace consent cannot be read: the step is
 * still sendable (consent is then treated as not provided), so this warns in
 * amber and links to the consent settings to fix it.
 */
export const GoogleAdsConsentLine = ({
  settingsHref,
}: {
  settingsHref: string
}) => {
  const t = useTranslations()

  return (
    <p
      className="flex items-start gap-1.5 text-amber-600 text-xs dark:text-amber-500"
      data-testid="google-ads-consent-line"
    >
      <AlertTriangleIcon
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0"
      />
      <span>
        {t("googleAds.conversionFields.consentInvalid")}{" "}
        <Link
          className="inline-flex items-center gap-0.5 underline underline-offset-2"
          href={settingsHref}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("googleAds.conversionFields.consentFixLink")}
          <ExternalLinkIcon
            aria-hidden="true"
            className="size-3 rtl:-scale-x-100"
          />
        </Link>
      </span>
    </p>
  )
}
