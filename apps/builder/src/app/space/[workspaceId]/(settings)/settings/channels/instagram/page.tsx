import { platformCredentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { InstagramManage } from "@/features/integration-instagram/components/instagram-manage"
import { listIntegrationInstagrams } from "@/features/integration-instagram/queries"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelInstagramPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const params = await props.params

  const workspaceId = getIdFromParams(params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const policy = await requireVisibleChannel(workspaceId, "instagram")
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: policy.ownerId,
    type: "instagram",
  })
  const promises = Promise.all([
    listIntegrationInstagrams({
      workspaceId: params.workspaceId,
    }),
  ])
  const canCreate = await resolveChannelCreatable(workspaceId, "instagram")

  return (
    <InstagramManage
      canCreate={canCreate}
      promises={promises}
      publicConfig={credential?.publicConfig ?? null}
      workspaceId={workspaceId}
    />
  )
}
