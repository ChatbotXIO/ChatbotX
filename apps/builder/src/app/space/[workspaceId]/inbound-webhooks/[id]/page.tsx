import { ChatbotXException } from "@chatbotx.io/business/errors"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { InboundWebhookEditor } from "@/features/inbound-webhooks/components/inbound-webhook-editor"
import { findInboundWebhookForEditor } from "@/features/inbound-webhooks/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function InboundWebhookEditorPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    notFound()
  }
  const { workspaceId, id } = data
  await requireWorkspacePermission(workspaceId, "superAdmin")

  const webhook = await findInboundWebhookForEditor({ workspaceId, id }).catch(
    (error: unknown) => {
      if (error instanceof ChatbotXException && error.code === "notFound") {
        return null
      }
      throw error
    },
  )
  if (!webhook) {
    notFound()
  }
  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4 pb-20">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("inboundWebhooks.title"),
            href: `/space/${workspaceId}/inbound-webhooks`,
          },
          { label: webhook.name, href: "" },
        ]}
      />
      <InboundWebhookEditor webhook={webhook} workspaceId={workspaceId} />
    </div>
  )
}
