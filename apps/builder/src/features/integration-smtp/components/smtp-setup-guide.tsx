"use client"

import type { smtpProviders } from "@chatbotx.io/integration-smtp/schema"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { z } from "zod"
import { setupGuideContent } from "../lib/setup-guide-content"
import { smtpProviderLabels } from "../schema/resource"

type SmtpProvider = z.infer<typeof smtpProviders>

type SmtpSetupGuideProps = {
  readonly provider: SmtpProvider
}

/** Collapsible, per-provider walkthrough: credentials, receiving, common errors. */
export const SmtpSetupGuide = ({ provider }: SmtpSetupGuideProps) => {
  const t = useTranslations()
  const content = setupGuideContent[provider]
  const providerLabel = smtpProviderLabels[provider]

  return (
    <Collapsible className="rounded-md border bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start font-medium text-sm">
        {t("smtp.guide.trigger", { provider: providerLabel })}
        <ChevronDownIcon className="size-4 shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-3 pt-1 pb-3 text-sm">
        <ol className="list-decimal space-y-1 ps-5">
          {content.steps.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
        {"note" in content && (
          <p className="text-muted-foreground">{t(content.note)}</p>
        )}
        {"docsUrl" in content && (
          <a
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            href={content.docsUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("smtp.guide.openDocs", { provider: providerLabel })}
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
        <div className="space-y-1">
          <p className="font-medium">{t("smtp.guide.errors.title")}</p>
          <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
            <li>{t("smtp.guide.errors.authFailed")}</li>
            <li>{t("smtp.guide.errors.timeout")}</li>
            <li>{t("smtp.guide.errors.imap")}</li>
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
