import { ChatbotXException } from "@chatbotx.io/business/errors"
import { pipelineService } from "@chatbotx.io/business/pipeline"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { pipelineScopeFromMember } from "../lib/access"

/**
 * Whether the signed-in member may view the pipeline. A missing pipeline and
 * one the member has no grant on are indistinguishable (both false), so the
 * page renders the same not-found for either. Uses the service the private
 * `privateGetPipelineAPI` calls, with the same member-derived scope.
 */
export async function canViewPipeline(input: {
  workspaceId: string
  pipelineId: string
}): Promise<boolean> {
  const current = await getCurrentUserAndTargetWorkspace(input.workspaceId)
  if (!current) {
    return false
  }
  try {
    await pipelineService.get({
      workspaceId: input.workspaceId,
      id: input.pipelineId,
      scope: pipelineScopeFromMember({
        workspaceMember: current.targetWorkspaceMember,
        isSupportSession: current.isSupportSession,
      }),
    })
    return true
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return false
    }
    throw error
  }
}
