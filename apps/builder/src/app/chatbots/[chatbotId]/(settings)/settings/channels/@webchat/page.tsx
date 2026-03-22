import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { SettingRow } from "@/components/setting-row"

export default async function SettingChannelWebchatPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <SettingRow
        description={t("webchat.description")}
        label={t("webchat.title")}
      >
        <Button className="w-full" size="sm" variant="secondary">
          <Link href={`/chatbots/${params.chatbotId}/webchats`}>
            {t("actions.manage")}
          </Link>
        </Button>
      </SettingRow>
    </div>
  )
}
