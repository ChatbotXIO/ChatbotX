import { notFound } from "next/navigation"
import { InstagramCapiTab } from "@/features/integration-instagram/components/instagram-capi-tab"
import { findIntegrationInstagram } from "@/features/integration-instagram/queries"
import { resolveIntegrationCapiConnection } from "@/features/meta-conversions/lib/resolve-integration-capi-connection"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function InstagramAdsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const integrationInstagram = await findIntegrationInstagram({
    workspaceId: data.workspaceId,
    id: data.id,
  })

  // The connection comes from what the integration stores — never from asking
  // Meta — and only plain fields reach the client: the encrypted token stays here.
  return (
    <InstagramCapiTab
      connection={resolveIntegrationCapiConnection(
        "instagram",
        integrationInstagram,
      )}
      integrationInstagram={{
        id: integrationInstagram.id,
        type: integrationInstagram.type,
        datasetId: integrationInstagram.datasetId,
        capiTestEventCode: integrationInstagram.capiTestEventCode,
      }}
    />
  )
}
