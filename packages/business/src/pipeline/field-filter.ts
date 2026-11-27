import {
  type PipelineFieldConditionInput,
  pipelineFieldConditionError,
} from "@chatbotx.io/database/partials"
import type { PipelineFieldModel } from "@chatbotx.io/database/types"
import { validationException } from "../errors"

/** 422 when `condition` cannot run on `field` (operator not offered for its type, bad operand). */
export function assertFieldCondition(
  field: Pick<PipelineFieldModel, "id" | "type">,
  condition: PipelineFieldConditionInput,
): void {
  const error = pipelineFieldConditionError(field.type, condition)
  if (error) {
    throw validationException("fieldConditions", `Field ${field.id}: ${error}`)
  }
}
