import { credentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function SettingChannelZaloPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userId = await getCurrentUserId()
  const credential = await credentialService.resolveForUser({
    userId,
    type: "zalo",
  })
  const hasZaloSettings = Boolean(credential?.publicConfig.clientId)

  const promises = Promise.all([
    listIntegrationZalo({
      where: { workspaceId },
    }),
  ])

  return (
    <ZaloManage
      isEnabled={hasZaloSettings}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
