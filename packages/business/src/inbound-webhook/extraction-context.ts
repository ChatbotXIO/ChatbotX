import type {
  CustomFieldType,
  InboundWebhookFieldMapping,
} from "@chatbotx.io/database/partials"
import { customFieldService } from "../custom-field/service"
import { notFoundException } from "../errors"
import { workspaceService } from "../workspace/service"
import { classifyMappedTarget } from "./extract"

const NUMERIC_ID = /^\d+$/

/** Custom-field targets are numeric ids; anything else would not even be a valid bigint. */
export const customFieldTargetIds = (
  fieldMappings: InboundWebhookFieldMapping[],
): string[] =>
  fieldMappings
    .map(({ target }) => target)
    .filter(
      (target) =>
        classifyMappedTarget(target) === "customField" &&
        NUMERIC_ID.test(target),
    )

export type ExtractionContext = {
  targetCountry: string | null
  customFieldTypeById: Map<string, CustomFieldType>
}

/** What extraction needs from the workspace: its country and the mapped custom fields' types. */
export const loadExtractionContext = async (input: {
  workspaceId: string
  fieldMappings: InboundWebhookFieldMapping[]
}): Promise<ExtractionContext> => {
  const { workspaceId, fieldMappings } = input
  const [workspace, customFields] = await Promise.all([
    workspaceService.find({ where: { id: workspaceId } }),
    customFieldService.findManyByIds({
      workspaceId,
      ids: customFieldTargetIds(fieldMappings),
    }),
  ])
  if (!workspace) {
    throw notFoundException("Workspace not found")
  }
  return {
    targetCountry: workspace.targetCountry,
    customFieldTypeById: new Map(
      customFields.map((field) => [field.id, field.type]),
    ),
  }
}
