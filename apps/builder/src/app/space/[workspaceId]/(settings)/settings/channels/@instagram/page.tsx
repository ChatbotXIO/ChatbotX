import { credentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { InstagramManage } from "@/features/integration-instagram/components/instagram-manage"
import { listIntegrationInstagrams } from "@/features/integration-instagram/queries"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function SettingChannelInstagramPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const params = await props.params

  const workspaceId = getIdFromParams(params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userId = await getCurrentUserId()
  const credential = await credentialService.resolveForUser({
    userId,
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
