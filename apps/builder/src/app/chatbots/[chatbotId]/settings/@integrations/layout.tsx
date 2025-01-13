"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { T } from "@tolgee/react"
import { BotMessageSquareIcon } from "lucide-react"
import type { ReactNode } from "react"

interface SettingIntegrationLayoutProps {
  openAI: ReactNode
}

export default function SettingIntegrationLayout({
  openAI,
}: SettingIntegrationLayoutProps) {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="item-1"
        className="transition-all hover:rounded-lg hover:[&[data-state=open]]:rounded-none"
      >
        <AccordionTrigger className="px-4 rounded-lg transition-all [&[data-state=open]]:bg-gray-200 hover:no-underline hover:bg-gray-200">
          <div className="flex items-center gap-2">
            <BotMessageSquareIcon size={30} />
            <T keyName="settings.integrations.OpenAI" />
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-4">{openAI}</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
