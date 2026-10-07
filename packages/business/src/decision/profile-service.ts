import { decisionRepository } from "@chatbotx.io/database/repositories"
import type {
  DecisionProfileModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import { evaluateDecisionStepSchema } from "@chatbotx.io/flow-config"
import { z } from "zod"
import { ChatbotXException, notFoundException } from "../errors"
import { decisionConnectionService } from "./connection-service"
import {
  compileNoulInstructions,
  type DecisionProfileContract,
  type DecisionProfileForm,
  decisionProfileContractSchema,
  decisionProfileFormSchema,
} from "./contracts"

type SaveDecisionProfileInput = DecisionProfileForm & { workspaceId: string }
const FIRST_CHARACTER = /^./

const humanize = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(FIRST_CHARACTER, (character) => character.toUpperCase())

const compileContract = (
  input: DecisionProfileForm,
): DecisionProfileContract => {
  const base = {
    inputs: [{ key: "currentMessage" as const, required: true as const }],
  }
  const decision = input.decision
  if (decision.type === "choice") {
    return decisionProfileContractSchema.parse({
      ...base,
      questions: [
        {
          instructions: decision.instructions,
          key: "result",
          label: input.name,
          options: decision.options.map((option) => ({
            ...option,
            label: humanize(option.value),
          })),
          type: "choice",
        },
      ],
    })
  }
  if (decision.type === "score") {
    return decisionProfileContractSchema.parse({
      ...base,
      questions: [
        {
          instructions: decision.instructions,
          key: "result",
          label: input.name,
          levels: decision.levels.map((level, index) => ({
            ...level,
            label: String(index + 1),
            value: index + 1,
          })),
          type: "score",
        },
      ],
    })
  }
  const instructions = compileNoulInstructions(decision)
  if (instructions.length > 1000) {
    throw new ChatbotXException(
      "Noul instructions exceed the 1,000-character provider limit",
      "invalidDecisionContract",
    )
  }
  return decisionProfileContractSchema.parse({
    ...base,
    questions: [{ ...decision, key: "result", label: input.name }],
  })
}

class DecisionProfileService {
  async create(input: SaveDecisionProfileInput): Promise<DecisionProfileModel> {
    const parsed = decisionProfileFormSchema.parse(input)
    const connection = await this.requireConnection({
      ...parsed,
      workspaceId: input.workspaceId,
    })
    return await decisionRepository.createProfile({
      connectionId: connection.id,
      contract: compileContract(parsed),
      description: parsed.description?.trim() || null,
      model: parsed.model.trim(),
      name: parsed.name.trim(),
      status: parsed.status,
      thresholdConfig: parsed.thresholdConfig,
      workspaceId: input.workspaceId,
    })
  }

  async update(
    input: SaveDecisionProfileInput & { id: string },
  ): Promise<DecisionProfileModel> {
    const existing = await decisionRepository.findProfileByIdForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!existing) {
      throw notFoundException("Decision profile not found")
    }
    const parsed = decisionProfileFormSchema.parse(input)
    const connection = await this.requireConnection({
      ...parsed,
      workspaceId: input.workspaceId,
    })
    const updated = await decisionRepository.updateProfileForWorkspace({
      connectionId: connection.id,
      contract: compileContract(parsed),
      description: parsed.description?.trim() || null,
      id: input.id,
      model: parsed.model.trim(),
      name: parsed.name.trim(),
      status: parsed.status,
      thresholdConfig: parsed.thresholdConfig,
      workspaceId: input.workspaceId,
    })
    if (!updated) {
      throw notFoundException("Decision profile not found")
    }
    return updated
  }

  async getForEdit(input: {
    id: string
    workspaceId: string
  }): Promise<DecisionProfileModel> {
    const profile = await decisionRepository.findProfileByIdForWorkspace(input)
    if (!profile) {
      throw notFoundException("Decision profile not found")
    }
    return profile
  }

  async list(workspaceId: string): Promise<DecisionProfileModel[]> {
    return await decisionRepository.listProfilesByWorkspaceId(workspaceId)
  }

  async listForSettings(input: {
    name?: string
    page?: number
    perPage?: number
    sort?: { desc: boolean; id: string }[]
    workspaceId: string
  }) {
    return await decisionRepository.listProfilesForSettings(input)
  }

  async listForFlow(workspaceId: string) {
    const profiles = await this.list(workspaceId)
    return await Promise.all(
      profiles.map(async (profile) => {
        const connection =
          await decisionRepository.findConnectionByIdForWorkspace({
            id: profile.connectionId,
            workspaceId,
          })
        return {
          connectionAvailable:
            connection?.status === "enabled" &&
            connection.modelCatalog.includes(profile.model),
          profile,
          profileEnabled: profile.status === "enabled",
        }
      }),
    )
  }

  async setEnabled(input: {
    enabled: boolean
    id: string
    workspaceId: string
  }): Promise<DecisionProfileModel> {
    const profile = await decisionRepository.updateProfileForWorkspace({
      id: input.id,
      status: input.enabled ? "enabled" : "disabled",
      workspaceId: input.workspaceId,
    })
    if (!profile) {
      throw notFoundException("Decision profile not found")
    }
    return profile
  }

  async deleteMany(input: { ids: string[]; workspaceId: string }) {
    return await decisionRepository.deleteProfilesByIdsForWorkspace({
      ids: [...new Set(input.ids)],
      workspaceId: input.workspaceId,
    })
  }

  async assertFlowReferencesPublishable(input: {
    nodes: FlowVersionModel["nodes"]
    workspaceId: string
  }): Promise<void> {
    const nodes = z
      .array(
        z
          .object({
            data: z
              .object({
                details: z
                  .object({
                    steps: z
                      .array(z.record(z.string(), z.unknown()))
                      .optional(),
                  })
                  .optional(),
              })
              .optional(),
          })
          .passthrough(),
      )
      .parse(input.nodes)
    for (const node of nodes) {
      for (const step of node.data?.details?.steps ?? []) {
        if (step.stepType !== "evaluateDecision") {
          continue
        }
        const parsed = evaluateDecisionStepSchema.safeParse(step)
        if (!parsed.success) {
          throw new ChatbotXException(
            "Evaluate Decision requires a profile",
            "invalidDecisionReference",
          )
        }
        await this.assertStepMapping({
          step: parsed.data,
          workspaceId: input.workspaceId,
        })
      }
    }
  }

  private async assertStepMapping(input: {
    step: z.infer<typeof evaluateDecisionStepSchema>
    workspaceId: string
  }) {
    const profile = await this.getForEdit({
      id: input.step.profileId,
      workspaceId: input.workspaceId,
    })
    const connection = await decisionRepository.findConnectionByIdForWorkspace({
      id: profile.connectionId,
      workspaceId: input.workspaceId,
    })
    decisionConnectionService.assertProfileConnectionOperational({
      connection,
      profile,
      workspaceId: input.workspaceId,
    })
    const question = decisionProfileContractSchema.parse(profile.contract)
      .questions[0]
    const fields = await decisionRepository.listCustomFieldTypesByIds({
      ids: input.step.fieldMappings.map((mapping) => mapping.customFieldId),
      workspaceId: input.workspaceId,
    })
    const fieldTypes = new Map(
      fields.map((field) => [field.id, field.type] as const),
    )
    for (const mapping of input.step.fieldMappings) {
      const correctValue =
        (mapping.value === "choice" && question?.type === "choice") ||
        (mapping.value === "score" && question?.type === "score") ||
        (mapping.value === "noul" && question?.type === "noul") ||
        mapping.value === "confidence" ||
        (mapping.value === "probability" && question?.type === "choice")
      if (
        !(
          correctValue &&
          fieldTypes.get(mapping.customFieldId) === mapping.customFieldType
        )
      ) {
        throw new ChatbotXException(
          "Evaluate Decision mapping is invalid for its Profile or custom field",
          "invalidDecisionReference",
        )
      }
    }
  }

  private async requireConnection(input: {
    connectionId: string
    model: string
    workspaceId: string
  }) {
    const connection = await decisionRepository.findConnectionByIdForWorkspace({
      id: input.connectionId,
      workspaceId: input.workspaceId,
    })
    if (!connection) {
      throw notFoundException("Decision connection not found")
    }
    if (!connection.modelCatalog.includes(input.model.trim())) {
      throw new ChatbotXException(
        "Decision model is not available on this connection",
        "invalidDecisionModel",
      )
    }
    return connection
  }
}

export const decisionProfileService = new DecisionProfileService()
