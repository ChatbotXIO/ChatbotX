import { notFound } from "next/navigation"

import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { UpdateMessengerForm } from "@/features/integration-messenger/update-messenger-form"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function UpdateMessengerPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const integrationMessenger = await findIntegrationMessenger({
    workspaceId,
    id,
  })

  return (
    <UpdateMessengerForm
      integrationMessenger={integrationMessenger}
      workspaceId={workspaceId}
    />
  )
}
