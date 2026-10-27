import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { PipelinesList } from "@/features/pipelines/components/list/pipelines-list"

export default async function PipelinesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[{ label: t("fields.pipelines.label"), href: "" }]}
      />
      <PipelinesList workspaceId={workspaceId} />
    </div>
  )
}
