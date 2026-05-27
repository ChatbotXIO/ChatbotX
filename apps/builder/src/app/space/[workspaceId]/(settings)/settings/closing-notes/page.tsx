import { db, eq } from "@chatbotx.io/database/client"
import { workspaceModel } from "@chatbotx.io/database/schema"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ClosingNotesSettings } from "@/features/closing-notes/closing-notes-settings"
import { listConversationCategories } from "@/features/closing-notes/queries/list-categories"

export default async function ClosingNotesPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const [workspace] = await db
    .select({ closingNotesMode: workspaceModel.closingNotesMode })
    .from(workspaceModel)
    .where(eq(workspaceModel.id, workspaceId))

  const categories = await listConversationCategories(workspaceId)

  return (
    <ClosingNotesSettings
      categories={categories}
      currentMode={workspace?.closingNotesMode ?? "disabled"}
      workspaceId={workspaceId}
    />
  )
}
