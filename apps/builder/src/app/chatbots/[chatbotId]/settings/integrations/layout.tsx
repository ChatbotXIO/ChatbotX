"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Form } from "@/components/ui/form"
import { T } from "@tolgee/react"
import { BotMessageSquareIcon } from "lucide-react"
import type { ReactNode } from "react"
import { updateSettingsAction } from "@/features/settings/action"
import { settingSchema } from "@/features/settings/schema"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormOptimisticAction } from "@next-safe-action/adapter-react-hook-form/hooks"

interface SettingIntegrationLayoutProps {
  openAI: ReactNode
}

export default function SettingIntegrationLayout({
  openAI,
}: SettingIntegrationLayoutProps) {

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
      </form>
    </Form>
  )
}
