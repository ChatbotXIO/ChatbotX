"use client"

import { Form } from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { updateSettingsAction } from "@/features/settings/action"
import { settingSchema } from "@/features/settings/schema"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormOptimisticAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import type { ReactNode } from "react"

interface LayoutSettingProps {
  integrations: ReactNode
}

const SettingTabs = [
  {
    value: "general",
    label: "settings.tab.general",
  },
  {
    value: "channels",
    label: "settings.tab.channels",
  },
  {
    value: "integrations",
    label: "settings.tab.integrations",
  },
  {
    value: "admins",
    label: "settings.tab.admins",
  },
  {
    value: "billing",
    label: "settings.tab.billing",
  },
]

export default function SettingLayout({ integrations }: LayoutSettingProps) {
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
        <Tabs defaultValue="integrations" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            {SettingTabs.map((setting) => (
              <TabsTrigger key={setting.value} value={setting.value}>
                <T keyName={setting.label} />
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="integrations" className="px-4">
            {integrations}
          </TabsContent>
        </Tabs>
      </form>
    </Form>
  )
}
