import { usePipelineDetail } from "@/features/pipelines/lib/use-pipeline-detail"
import { useWorkspaceId } from "@/hooks/routing"

const NO_FIELDS: { id: string; name: string }[] = []

/** Custom fields of one pipeline, for the field pickers of the Pipelines step. */
export function usePipelineFields(pipelineId: string) {
  const workspaceId = useWorkspaceId()
  const query = usePipelineDetail(workspaceId ?? "", pipelineId, {
    enabled: Boolean(workspaceId) && Boolean(pipelineId),
  })
  return { fields: query.data?.fields ?? NO_FIELDS }
}
