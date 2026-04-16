import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { UpdateInstagramForm } from "@/features/integration-instagram/components/update-instagram-form"
import { findIntegrationInstagram } from "@/features/integration-instagram/queries"

export default async function UpdateInstagramPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { workspaceId, id } = await props.params

  const integrationInstagram = await findIntegrationInstagram({
    id,
    workspaceId,
  })

  return (
    <FlowStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <CustomFieldStoreProvider autoInitialize={true} workspaceId={workspaceId}>
        <UpdateInstagramForm integrationInstagram={integrationInstagram} />
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
