import { UpdateInstagramForm } from "@/features/integration-instagram/components/update-instagram-form"
import { findIntegrationInstagram } from "@/features/integration-instagram/queries"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function UpdateInstagramPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { workspaceId, id } = await props.params
  await requireWorkspacePermission(workspaceId, "superAdmin")

  const integrationInstagram = await findIntegrationInstagram({
    id,
    workspaceId,
  })

  return <UpdateInstagramForm integrationInstagram={integrationInstagram} />
}
