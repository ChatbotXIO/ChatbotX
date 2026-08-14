import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { OpenaiCompatibleConnect } from "@/features/integration-openai-compatible/openai-compatible-connect"
import { listIntegrationOpenaiCompatible } from "@/features/integration-openai-compatible/queries"

export default async function SettingsIntegrationOpenaiCompatiblePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([
    listIntegrationOpenaiCompatible({ workspaceId }),
  ])

  return <OpenaiCompatibleConnect promises={promises} />
}
