import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelZaloPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return notFound()
  }
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
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
