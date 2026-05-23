import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { InstagramManage } from "@/features/integration-instagram/components/instagram-manage"
import { listIntegrationInstagrams } from "@/features/integration-instagram/queries"

export default async function SettingChannelInstagramPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const params = await props.params

  const workspaceId = getIdFromParams(params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return notFound()
  }
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "instagram",
  })
  const promises = Promise.all([
    listIntegrationInstagrams({
      workspaceId: params.workspaceId,
    }),
  ])

  return (
    <InstagramManage
      promises={promises}
      publicConfig={credential?.publicConfig ?? null}
      workspaceId={workspaceId}
    />
  )
}
