"use client"

import { SettingRow } from "@/components/setting-row"
import { Button } from "@/components/ui/button"
import { T, useTranslate } from "@tolgee/react"
import { use } from "react"
import type { getWhastappIntegration } from "./queries"
import { WhatsappConnectDialog } from "./whatsapp-connect-dialog"
import { WhatsappDisconnectDialog } from "./whatsapp-disconnect-dialog"
import Link from "next/link"

type WhatsappManageProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getWhastappIntegration>>]>
}

export function WhatsappManage({ chatbotId, promises }: WhatsappManageProps) {
  const [integrationWhatsapp] = use(promises)
  const { t } = useTranslate()

  return (
    <SettingRow
      label={t("Integration.Whatsapp.Title")}
      description={t("Integration.Whatsapp.Descriptions")}
    >
      {integrationWhatsapp ? (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm">
            <Link href={`/chatbots/${chatbotId}/whatsapp/useful-links`}>
              <T keyName="Integration.ManageBtn" />
            </Link>
          </Button>
          <WhatsappDisconnectDialog chatbotId={chatbotId} />
        </div>
      ) : (
        <WhatsappConnectDialog chatbotId={chatbotId} />
      )}
    </SettingRow>
  )
}
