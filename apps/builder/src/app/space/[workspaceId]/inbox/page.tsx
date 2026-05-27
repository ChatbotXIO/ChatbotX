import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { ChatLayout } from "@/features/chat/chat-layout"
import { getClosingNotesConfig } from "@/features/closing-notes/queries/get-config"
import { listHiddenContactFieldKeys } from "@/features/custom-fields/queries/visibility"
import { listLifecycleStages } from "@/features/lifecycle-stages/queries"

type InboxPageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function InboxPage({ params }: InboxPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const layout = (await cookies()).get("csm:layout:inbox")
  // Default Respond.io (Pedro iter 36, medido via Chrome MCP, viewport 2560
  // sidebar Inbox colapsada):
  //   - Lista chats:  477px (19.34% da área redimensionável)
  //   - Mensagens:   1640px (66.48%)
  //   - Drawer:       350px (14.18%)
  // Cookie persistido tem prioridade — usuário mantém ajustes próprios.
  const savedLayout = layout ? JSON.parse(layout.value) : [19, 67, 14]
  const [lifecycleStages, hiddenFieldKeys, closingNotesConfig] =
    await Promise.all([
      listLifecycleStages(workspaceId),
      listHiddenContactFieldKeys(workspaceId),
      getClosingNotesConfig(workspaceId),
    ])

  return (
    <div className="flex-1">
      <ChatLayout
        closingNoteCategories={closingNotesConfig.categories}
        closingNotesMode={closingNotesConfig.mode}
        hiddenFieldKeys={hiddenFieldKeys}
        layout={savedLayout}
        lifecycleStages={lifecycleStages}
        workspaceId={workspaceId}
      />
    </div>
  )
}
