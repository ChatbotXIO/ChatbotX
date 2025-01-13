import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { T } from "@tolgee/react"
import Link from "next/link"

import { SettingIntegrationOpenAIDialogConnect } from "@/features/settings/integrations/open-ai/components/dialog-connect"
import { SettingIntegrationOpenAIDialogDisconnect } from "@/features/settings/integrations/open-ai/components/dialog-disconnect"
import { SettingIntegrationOpenAIDialogEdit } from "@/features/settings/integrations/open-ai/components/dialog-edit"

import { useState } from "react"

export const SettingIntegrationOpenAI = () => {
  const [isConnect, setIsConnect] = useState(false)

  const renderButtonConnect = () => {
    return (
      <>
        <SettingIntegrationOpenAIDialogEdit />
        <SettingIntegrationOpenAIDialogDisconnect />
      </>
    )
  }

  return (
    <Card className="rounded-lg">
      <CardContent className="py-6 px-4 flex justify-between">
        <CardTitle>
          <T keyName="settings.integrations.OpenAI.title" />
        </CardTitle>
        <div className={cn(isConnect ? "flex flex-col gap-2" : "")}>
          {isConnect ? (
            renderButtonConnect()
          ) : (
            <SettingIntegrationOpenAIDialogConnect />
          )}
        </div>
        <CardDescription>
          <T keyName="settings.integrations.OpenAI.Descriptions" />
          <Link href="/docs" className="text-blue-500 pl-1">
            Learn More
          </Link>
        </CardDescription>
      </CardContent>
    </Card>
  )
}
