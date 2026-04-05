import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"
import AIMcpServersTable from "@/features/ai-mcp-servers/ai-mcp-servers-table"
import { listAIMcpServers } from "@/features/ai-mcp-servers/queries"

type AIMcpServersPageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function AIMcpServersPage({
  params,
}: AIMcpServersPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([
    listAIMcpServers({
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AITab />
      <Suspense>
        <AIMcpServersTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
