"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { BotIcon, MailIcon, TableIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, Suspense } from "react"

type SettingIntegrationLayoutProps = {
  openAI: ReactNode
  gemini: ReactNode
  googleSheets: ReactNode
  mailchimp: ReactNode
}

function SettingIntegrationLayoutContent({
  openAI,
  gemini,
  googleSheets,
  mailchimp,
}: SettingIntegrationLayoutProps) {
  const t = useTranslations()
  const searchParams = useSearchParams()
  const integration = searchParams.get("integration")

  const integrationItems = [
    {
      id: "openai",
      keyName: t("openAI.title"),
      icon: BotIcon,
      content: openAI,
    },
    {
      id: "gemini",
      keyName: t("gemini.title"),
      icon: BotIcon,
      content: gemini,
    },
    {
      id: "googleSheets",
      keyName: t("googleSheets.title"),
      icon: TableIcon,
      content: googleSheets,
    },
    {
      id: "mailchimp",
      keyName: t("mailchimp.title"),
      icon: MailIcon,
      content: mailchimp,
    },
  ]

  return (
    <Accordion
      className="w-full"
      collapsible
      defaultValue={integration ?? undefined}
      key={integration}
      type="single"
    >
      {integrationItems.map((integration) => (
        <AccordionItem
          className="transition-all hover:rounded-lg hover:data-[state=open]:rounded-none"
          key={integration.id}
          value={integration.id}
        >
          <AccordionTrigger className="rounded-none px-4 transition-all hover:bg-gray-200 hover:no-underline data-[state=open]:bg-gray-200">
            <div className="flex items-center gap-2">
              <integration.icon size={24} />
              {integration.keyName}
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-4">
            {integration.content}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export default function SettingIntegrationLayout(
  props: SettingIntegrationLayoutProps,
) {
  return (
    <Suspense>
      <SettingIntegrationLayoutContent {...props} />
    </Suspense>
  )
}
