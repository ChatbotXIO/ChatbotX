import { Suspense } from "react"
import { AIHubBreadcrumb } from "@/features/ai-hub/ai-hub-breadcrumb"
import AIMcpServersTable from "@/features/ai-mcp-servers/ai-mcp-servers-table"
import { listAIMcpServers } from "@/features/ai-mcp-servers/queries"

type AIMcpServersPageProps = {
  params: Promise<{
    chatbotId: string
  }>
}

export default async function AIMcpServersPage({
  params,
}: AIMcpServersPageProps) {
  const { chatbotId } = await params

  const promises = Promise.all([
    listAIMcpServers({
      chatbotId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AIHubBreadcrumb />
      <Suspense>
        <AIMcpServersTable promises={promises} />
      </Suspense>
    </div>
  )
}
