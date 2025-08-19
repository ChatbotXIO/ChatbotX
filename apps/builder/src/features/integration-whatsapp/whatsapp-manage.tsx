"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { T, useTranslate } from "@tolgee/react"
import Link from "next/link"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import type { getWhastappIntegration } from "./queries"
import { WhatsappConnectDialog } from "./whatsapp-connect-dialog"
import { WhatsappDisconnectDialog } from "./whatsapp-disconnect-dialog"

type WhatsappManageProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getWhastappIntegration>>]>
}

export function WhatsappManage({ chatbotId, promises }: WhatsappManageProps) {
  const [integrationWhatsapp] = use(promises)
  const { t } = useTranslate()

  return (
    <SettingRow
      description={t("Integration.Whatsapp.Descriptions")}
      label={t("Integration.Whatsapp.Title")}
    >
      {integrationWhatsapp ? (
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary">
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
