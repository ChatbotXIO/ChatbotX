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
  type DecisionProfileContract,
  decisionProfileContractSchema,
} from "./contracts"

export type SaveDecisionProfileInput = {
  connectionId: string
  contract: DecisionProfileContract
  description?: string | null
  model: string
  name: string
  workspaceId: string
}

class DecisionProfileService {
  async create(input: SaveDecisionProfileInput): Promise<DecisionProfileModel> {
    const contract = decisionProfileContractSchema.parse(input.contract)
    const connection = await this.requireConnection(input)

    return await decisionRepository.createProfile({
      ...input,
      connectionId: connection.id,
      contract,
      name: input.name.trim(),
      providerKind: connection.providerKind,
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

    const contract = decisionProfileContractSchema.parse(input.contract)
    const connection = await this.requireConnection(input)
    const updated = await decisionRepository.updateProfileForWorkspace({
      connectionId: connection.id,
      contract,
      description: input.description?.trim() || null,
      id: input.id,
      model: input.model.trim(),
      name: input.name.trim(),
      providerKind: connection.providerKind,
      workspaceId: input.workspaceId,
    })
    if (!updated) {
      throw notFoundException("Decision profile not found")
    }

    return updated
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

  async listActiveForFlow(
    workspaceId: string,
  ): Promise<DecisionProfileModel[]> {
    const profiles = await this.list(workspaceId)

    return profiles.filter((profile) => profile.status === "enabled")
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
  }): Promise<void> {
    const profile = await decisionRepository.findProfileByIdForWorkspace({
      id: input.step.profileId,
      workspaceId: input.workspaceId,
    })
    if (profile?.status !== "enabled") {
      throw new ChatbotXException(
        "Evaluate Decision profile is not active in this workspace",
        "invalidDecisionReference",
      )
    }

    const connection = await decisionRepository.findConnectionByIdForWorkspace({
      id: profile.connectionId,
      workspaceId: input.workspaceId,
    })
    decisionConnectionService.assertProfileConnectionOperational({
      connection,
      profile,
      workspaceId: input.workspaceId,
    })

    const contract = decisionProfileContractSchema.parse(profile.contract)
    const questions = new Map(
      contract.questions.map((question) => [question.key, question] as const),
    )
    const fields = await decisionRepository.listCustomFieldTypesByIds({
      ids: input.step.fieldMappings.map((mapping) => mapping.customFieldId),
      workspaceId: input.workspaceId,
    })
    const fieldTypes = new Map(
      fields.map((field) => [field.id, field.type] as const),
    )

    for (const mapping of input.step.fieldMappings) {
      const question = questions.get(mapping.questionKey)
      const mappingMatchesQuestion =
        (mapping.value === "choice" && question?.type === "choice") ||
        (mapping.value === "score" && question?.type === "score") ||
        (mapping.value === "noul" && question?.type === "noul") ||
        (mapping.value === "confidence" && question) ||
        (mapping.value === "probability" && question?.type === "choice")
      if (
        !(question && mappingMatchesQuestion) ||
        fieldTypes.get(mapping.customFieldId) !== mapping.customFieldType
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
