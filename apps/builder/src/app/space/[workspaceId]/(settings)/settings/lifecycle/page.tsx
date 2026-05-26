import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { LifecycleStagesEditor } from "@/features/lifecycle-stages/lifecycle-stages-editor"
import { listLifecycleStages } from "@/features/lifecycle-stages/queries"

export default async function LifecyclePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const stages = await listLifecycleStages(workspaceId)

  const initialStages = stages.map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    icon: s.icon,
    color: s.color,
    position: s.position,
    isDefault: s.isDefault,
    isLost: s.isLost,
  }))

  return <LifecycleStagesEditor initialStages={initialStages} />
}
