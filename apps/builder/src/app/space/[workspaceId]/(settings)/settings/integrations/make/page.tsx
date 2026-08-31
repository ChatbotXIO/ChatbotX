import {
  platformCredentialService,
  workspaceApiTokenService,
  workspaceService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ManageMake } from "@/features/integration-make/components/manage-make"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

export default async function SettingIntegrationMakePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  const credential = workspace
    ? await platformCredentialService.resolveForOwner({
        ownerId: await resolveOwnerForWorkspace(workspace),
        type: "make",
      })
    : undefined

  const hasWorkspaceToken = workspace
    ? await workspaceApiTokenService.hasToken({ workspaceId })
    : false

  return (
    <ManageMake
      hasWorkspaceToken={hasWorkspaceToken}
      inviteUrl={credential?.config.inviteUrl}
    />
  )
}
