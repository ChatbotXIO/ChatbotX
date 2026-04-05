import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import ManageAccessTokenPage from "@/features/workspaces/manage-access-token"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingsWorksaceTokenPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const userAndChatbot = await getCurrentUserAndTargetChatbot(workspaceId)
  if (!userAndChatbot) {
    return notFound()
  }

  return <ManageAccessTokenPage workspace={userAndChatbot.targetChatbot} />
}
