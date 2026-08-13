import { platformCredentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationTiktoks } from "@/features/integration-tiktok/queries"
import { TiktokManage } from "@/features/integration-tiktok/tiktok-manage"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelTiktokPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const policy = await requireVisibleChannel(workspaceId, "tiktok")
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: policy.ownerId,
    type: "tiktok",
  })
  const isEnabled = Boolean(credential?.publicConfig.clientId)

  const promises = Promise.all([
    listIntegrationTiktoks({
      where: { workspaceId },
    }),
  ])
  const canCreate = await resolveChannelCreatable(workspaceId, "tiktok")

  return (
    <TiktokManage
      canCreate={canCreate}
      isEnabled={isEnabled}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
