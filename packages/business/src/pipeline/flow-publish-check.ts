import { pipelineRepository } from "@chatbotx.io/database/repositories"
import type { FlowVersionModel } from "@chatbotx.io/database/types"
import {
  findMissingRequiredPipelineFields,
  type PipelineStepFieldValue,
  pipelineStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { z } from "zod"
import { validationException } from "../errors"

type AddToPipelineStep = {
  nodeName: string
  pipelineId: string
  fieldValues: PipelineStepFieldValue[]
}

const flowNodesSchema = z.array(
  z
    .object({
      data: z
        .object({
          name: z.string().optional(),
          details: z
            .object({
              steps: z.array(z.record(z.string(), z.unknown())).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .passthrough(),
)

/**
 * Every "Add to pipeline" step of a flow, with the name of its node. A step the
 * schema does not accept (no pipeline chosen yet, say) is skipped: publish has
 * other checks for a malformed flow, and this one only judges well-formed steps.
 */
function collectAddToPipelineSteps(
  nodes: FlowVersionModel["nodes"],
): AddToPipelineStep[] {
  const parsedNodes = flowNodesSchema.safeParse(nodes)
  if (!parsedNodes.success) {
    return []
  }
  return parsedNodes.data.flatMap((node) =>
    (node.data?.details?.steps ?? []).flatMap((step) => {
      if (step.stepType !== stepTypes.enum.pipeline) {
        return []
      }
      const parsed = pipelineStepSchema.safeParse(step)
      if (!parsed.success || parsed.data.action !== "addToPipeline") {
        return []
      }
      return [
        {
          nodeName: node.data?.name ?? "",
          pipelineId: parsed.data.pipelineId,
          fieldValues: parsed.data.fieldValues,
        },
      ]
    }),
  )
}

/**
 * Rejects a flow whose "Add to pipeline" step leaves a required pipeline field
 * without a value. Creating the item would refuse it at run time and route the
 * step to error with only a log line, so the author finds out here instead,
 * with the node and the field names. A deleted pipeline is not checked: the
 * step already routes to error for it, and publish must not fail on it.
 */
export async function assertFlowPipelineStepsPublishable(input: {
  nodes: FlowVersionModel["nodes"]
  workspaceId: string
}): Promise<void> {
  const steps = collectAddToPipelineSteps(input.nodes)
  if (steps.length === 0) {
    return
  }
  const fields = await pipelineRepository.listFieldsByPipelineIds({
    workspaceId: input.workspaceId,
    pipelineIds: [...new Set(steps.map((step) => step.pipelineId))],
  })
  const problems = steps.flatMap((step) => {
    const missing = findMissingRequiredPipelineFields(
      step.fieldValues,
      fields.filter((field) => field.pipelineId === step.pipelineId),
    )
    if (missing.length === 0) {
      return []
    }
    const names = missing.map((field) => field.name).join(", ")
    return [`"${step.nodeName}": ${names}`]
  })
  if (problems.length > 0) {
    throw validationException(
      "nodes",
      `Add to pipeline is missing required pipeline fields. Set a value for each in the step: ${problems.join("; ")}`,
    )
  }
}
