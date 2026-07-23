import {
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"

export const loadServableWorkspace = async (workspaceId: string) => {
  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  const servable = !(workspace && isWorkspaceScheduledForDeletion(workspace))

  return { servable, workspace }
}
