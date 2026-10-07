import { createStarterDefinition } from "@chatbotx.io/mini-app"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { MiniAppEditor } from "@/features/mini-apps/editor/mini-app-editor"
import { defaultTextKey } from "@/features/mini-apps/lib/labels"
import { listWhatsappPublishTargets } from "@/features/mini-apps/queries"

export default async function CreateMiniAppPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const [t, publishTargets] = await Promise.all([
    getTranslations(),
    listWhatsappPublishTargets(workspaceId),
  ])
  const definition = createStarterDefinition(
    t("miniApps.editor.newScreenTitle"),
    (key) => t(defaultTextKey[key]),
  )

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("miniApps.title"),
            href: `/space/${workspaceId}/mini-apps`,
          },
          { label: t("actions.create"), href: "" },
        ]}
      />
      <MiniAppEditor
        initialDefinition={definition}
        initialName=""
        publishTargets={publishTargets}
        workspaceId={workspaceId}
      />
    </div>
  )
}
