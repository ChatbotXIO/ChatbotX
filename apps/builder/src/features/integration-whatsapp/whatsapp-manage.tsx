"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
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
  const t = useTranslations()

  return (
    <SettingRow
      description={t("whatsapp.description")}
      label={t("whatsapp.title")}
    >
      {integrationWhatsapp ? (
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary">
            <Link href={`/chatbots/${chatbotId}/whatsapp/useful-links`}>
              {t("actions.manage")}
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
