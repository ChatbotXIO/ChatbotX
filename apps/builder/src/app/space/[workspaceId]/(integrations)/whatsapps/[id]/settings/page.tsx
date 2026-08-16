import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { findConversationalAutomation } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { WhatsappAutomationManage } from "@/features/integration-whatsapp/automation/whatsapp-automation-manage"
import { UpdateWhatsappProfile } from "@/features/integration-whatsapp/profile/update-whatsapp-profile"
import {
  findIntegrationWhatsapp,
  toIntegrationWhatsappLinkable,
} from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

// Merged tab: the former Profile and Automation tabs now live together under
// a single "Settings" tab, each in its own card.
export default async function WhatsappSettingsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const t = await getTranslations()
  const integrationWhatsapp = await findIntegrationWhatsapp({
    workspaceId: data.workspaceId,
    id: data.id,
  })

  const promises = Promise.all([
    findConversationalAutomation(
      integrationWhatsapp.auth as WhatsappAuthValue,
    ).catch((err) => ({
      enable_welcome_message: false,
      prompts: [],
      commands: [],
      error:
        err instanceof Error
          ? err.message
          : "Failed to load automation settings",
    })),
  ])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("whatsapp.tabs.profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateWhatsappProfile workspaceId={data.workspaceId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("whatsapp.tabs.automation")}</CardTitle>
        </CardHeader>
        <CardContent>
          <WhatsappAutomationManage
            integrationWhatsapp={toIntegrationWhatsappLinkable(
              integrationWhatsapp,
            )}
            promises={promises}
          />
        </CardContent>
      </Card>
    </div>
  )
}
