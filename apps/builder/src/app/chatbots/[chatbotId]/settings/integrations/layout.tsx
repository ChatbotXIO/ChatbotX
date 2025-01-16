"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Form } from "@/components/ui/form"
import { updateSettingsAction } from "@/features/settings/action"
import { settingSchema } from "@/features/settings/schema"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormOptimisticAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { BotMessageSquareIcon, TableIcon } from "lucide-react"
import type { ReactNode } from "react"

interface SettingIntegrationLayoutProps {
  openAI: ReactNode
  googleSheets: ReactNode
}

export default function SettingIntegrationLayout({
  openAI,
  googleSheets,
}: SettingIntegrationLayoutProps) {
  const IntegrationItems = [
    {
      keyName: "settings.integrations.OpenAI",
      icon: <BotMessageSquareIcon size={30} />,
      content: openAI,
    },
    {
      keyName: "settings.integrations.GoogleSheets",
      icon: <TableIcon size={30} />,
      content: googleSheets,
    },
  ]

  const { form, action, handleSubmitWithAction, resetFormAndAction } =
    useHookFormOptimisticAction(
      updateSettingsAction,
      zodResolver(settingSchema),
      {
        actionProps: {
          currentState: {},
          updateFn: (state: unknown, input: unknown) => {
            console.log(state, input)
            return {}
          },
        },
        formProps: {
          mode: "onChange",
        },
      },
    )

  return (
    <Form {...form}>
      <form onSubmit={handleSubmitWithAction}>
        <Accordion type="single" collapsible className="w-full">
          {IntegrationItems.map((integration) => (
            <AccordionItem
              key={integration.keyName}
              value={integration.keyName}
              className="transition-all hover:rounded-lg hover:[&[data-state=open]]:rounded-none"
            >
              <AccordionTrigger className="px-4 rounded-none transition-all [&[data-state=open]]:bg-gray-200 hover:no-underline hover:bg-gray-200">
                <div className="flex items-center gap-2">
                  {integration.icon}
                  <T keyName={integration.keyName} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4">
                {integration.content}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </form>
    </Form>
  )
}
