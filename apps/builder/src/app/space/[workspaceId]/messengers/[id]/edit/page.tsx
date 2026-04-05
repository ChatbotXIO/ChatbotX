import { notFound } from "next/navigation"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
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
    <FlowStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <CustomFieldStoreProvider autoInitialize={true} workspaceId={workspaceId}>
        <UpdateMessengerForm
          integrationMessenger={integrationMessenger}
          workspaceId={workspaceId}
        />
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
