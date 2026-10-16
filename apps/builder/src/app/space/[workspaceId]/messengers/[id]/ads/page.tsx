import { notFound } from "next/navigation"
import { MessengerCapiTab } from "@/features/integration-messenger/components/messenger-capi-tab"
import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { resolveIntegrationCapiConnection } from "@/features/meta-conversions/lib/resolve-integration-capi-connection"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function MessengerAdsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const integrationMessenger = await findIntegrationMessenger({
    workspaceId: data.workspaceId,
    id: data.id,
  })

  // The connection comes from what the integration stores — never from asking
  // Meta — and only plain fields reach the client: the encrypted token stays here.
  return (
    <MessengerCapiTab
      connection={resolveIntegrationCapiConnection(
        "messenger",
        integrationMessenger,
      )}
      integrationMessenger={{
        id: integrationMessenger.id,
        datasetId: integrationMessenger.datasetId,
        capiTestEventCode: integrationMessenger.capiTestEventCode,
      }}
    />
  )
}
