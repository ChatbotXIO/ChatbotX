"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { memo, useMemo } from "react"

type WhatsappUsefulLinksProps = {
  urls: {
    analytics: string
    templates: string
    paymentMethods: string
    paymentHistory: string
  }
}

type LinkConfig = {
  href: string
  label: string
  ariaLabel?: string
}

export default memo(function WhatsappUsefulLinks({
  urls,
}: WhatsappUsefulLinksProps) {
  const t = useTranslations()

  const links = useMemo(
    (): LinkConfig[] => [
      {
        href: urls.analytics,
        label: t("fields.analytics.label"),
        ariaLabel: "Open WhatsApp Analytics in new tab",
      },
      {
        href: urls.templates,
        label: t("fields.templateMessages.label"),
        ariaLabel: "Open WhatsApp Template Messages in new tab",
      },
      {
        href: urls.paymentMethods,
        label: t("fields.paymentMethods.label"),
        ariaLabel: "Open WhatsApp Payment Methods in new tab",
      },
      {
        href: urls.paymentHistory,
        label: t("fields.paymentHistory.label"),
        ariaLabel: "Open WhatsApp Payment History in new tab",
      },
    ],
    [urls, t],
  )

  return (
    <div className="my-4 flex flex-col flex-wrap items-center gap-4">
      {links.map((link) => (
        <Button
          asChild
          className="w-xs"
          key={link.label}
          size="sm"
          variant="secondary"
        >
          <Link
            aria-label={link.ariaLabel}
            href={link.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {link.label}
          </Link>
        </Button>
      ))}
    </div>
  )
})
