import { getIdFromParams } from "@chatbotx.io/utils"
import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { TestQueryPage } from "@/features/ai-files/components/test-query/test-query-page"
import { listAIFiles } from "@/features/ai-files/queries"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"

type TestQueryPageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function AIFilesTestQueryPage({
  params,
}: TestQueryPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const t = await getTranslations()
  const { data: files } = await listAIFiles({ workspaceId })

  return (
    <div className="space-y-6">
      <AITab />
      <div className="space-y-1">
        <Link
          className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:underline"
          href={`/space/${workspaceId}/ai-files`}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {t("aiFiles.testQuery.backToKnowledge")}
        </Link>
        <h1 className="font-semibold text-xl">
          {t("aiFiles.testQuery.title")}
        </h1>
      </div>
      <Suspense>
        <TestQueryPage files={files} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
