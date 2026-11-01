import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { MuseConnect } from "@/features/integration-muse/muse-connect"
import { findIntegrationMuse } from "@/features/integration-muse/queries"

export default async function SettingsIntegrationMusePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([findIntegrationMuse({ workspaceId })])

  return <MuseConnect promises={promises} />
}
