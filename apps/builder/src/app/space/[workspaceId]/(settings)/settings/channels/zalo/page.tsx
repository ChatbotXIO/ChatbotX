import { platformCredentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelZaloPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const policy = await requireVisibleChannel(workspaceId, "zalo")
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: policy.ownerId,
    type: "zalo",
  })
  const hasZaloSettings = Boolean(credential?.publicConfig.clientId)

  const promises = Promise.all([
    listIntegrationZalo({
      where: { workspaceId },
    }),
  ])
  const canCreate = await resolveChannelCreatable(workspaceId, "zalo")

  return (
    <ZaloManage
      canCreate={canCreate}
      isEnabled={hasZaloSettings}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
