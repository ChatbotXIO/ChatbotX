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
import { ConversationRoutingCard } from "@/features/integration-whatsapp/components/conversation-routing-card"
import { UpdateWhatsappProfile } from "@/features/integration-whatsapp/profile/update-whatsapp-profile"
import {
  findIntegrationWhatsapp,
  toIntegrationWhatsappLinkable,
} from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

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
  const [integrationWhatsapp, currentUserAndWorkspace] = await Promise.all([
    findIntegrationWhatsapp({
      workspaceId: data.workspaceId,
      id: data.id,
    }),
    getCurrentUserAndTargetWorkspace(data.workspaceId),
  ])
  const isSuperAdmin = currentUserAndWorkspace
    ? hasWorkspacePermission(
        currentUserAndWorkspace.targetWorkspaceMember.permissions,
        "superAdmin",
      )
    : false

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

      <ConversationRoutingCard
        handoverResumeFlowId={integrationWhatsapp.handoverResumeFlowId}
        integrationWhatsappId={data.id}
        isSuperAdmin={isSuperAdmin}
        workspaceId={data.workspaceId}
      />
    </div>
  )
}
