import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ManageMake } from "@/features/integration-make/components/manage-make"

export default async function SettingIntegrationMakePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  const credential = workspace?.ownerId
    ? await platformCredentialService.resolveForOwner({
        ownerId: workspace.ownerId,
        type: "make",
      })
    : undefined

  return (
    <ManageMake
      inviteUrl={credential?.config.inviteUrl}
      workspaceToken={workspace?.token ?? undefined}
    />
  )
}
