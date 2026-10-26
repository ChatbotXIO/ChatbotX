import { getIdFromParams, isNumericId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { AIFileDetail } from "@/features/ai-files/components/ai-file-detail"
import { getAIFile } from "@/features/ai-files/queries"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"

type AIFileDetailPageProps = {
  params: Promise<{ workspaceId: string; aiFileId: string }>
}

export default async function AIFileDetailPage({
  params,
}: AIFileDetailPageProps) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const aiFileId = getIdFromParams(resolvedParams, "aiFileId")
  // getIdFromParams does not check the format; a non-numeric id would fail
  // the bigint cast as a 500 instead of a 404.
  if (!(workspaceId && aiFileId && isNumericId(aiFileId))) {
    return notFound()
  }
  const file = await getAIFile({ workspaceId, id: aiFileId })
  if (!file) {
    return notFound()
  }

  return (
    <div className="space-y-6">
      <AITab />
      <AIFileDetail aiFileId={aiFileId} workspaceId={workspaceId} />
    </div>
  )
}
