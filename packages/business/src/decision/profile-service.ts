import { type DatabaseClient, db, sql } from "@chatbotx.io/database/client"
import { decisionRepository } from "@chatbotx.io/database/repositories"
import type {
  DecisionProfileModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import {
  globalRouterConfigSchema,
  type DecisionProfileForm as SharedDecisionProfileForm,
  decisionProfileFormSchema as sharedDecisionProfileFormSchema,
} from "@chatbotx.io/decision-config"
import { evaluateDecisionStepSchema } from "@chatbotx.io/flow-config"
import { z } from "zod"
import { aiAgentService } from "../ai-agent/service"
import { inboxTeamService } from "../enterprise/inbox-team/service"
import { ChatbotXException, notFoundException } from "../errors"
import { flowService } from "../flow/service"
import { workspaceMemberService } from "../workspace-member/service"
import {
  compileNoulInstructions,
  type DecisionProfileContract,
  decisionProfileContractSchema,
} from "./contracts"

type SaveDecisionProfileInput = Omit<
  SharedDecisionProfileForm,
  "globalRouterConfig" | "globalRouterEnabled"
> & {
  globalRouterConfig?: SharedDecisionProfileForm["globalRouterConfig"]
  globalRouterEnabled?: boolean
  workspaceId: string
}
const FIRST_CHARACTER = /^./

const humanize = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(FIRST_CHARACTER, (character) => character.toUpperCase())

const compileContract = (
  input: SharedDecisionProfileForm,
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
  private async lockGlobalRouterWorkspace(
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`decision-global-router:${workspaceId}`}, 0))`,
    )
  }

  private assertGlobalRouterCanBeEnabled(input: {
    profileStatus: "disabled" | "enabled"
  }): void {
    if (input.profileStatus !== "enabled") {
      throw new ChatbotXException(
        "Global Router profile must be enabled",
        "invalidDecisionReference",
      )
    }
  }

  private async assertGlobalRouterConfiguration(input: {
    config: NonNullable<SharedDecisionProfileForm["globalRouterConfig"]>
    decision: SharedDecisionProfileForm["decision"]
    workspaceId: string
  }): Promise<void> {
    const config = globalRouterConfigSchema.parse(input.config)
    const decision = input.decision
    if (config.routes.some((route) => route.type !== decision.type)) {
      throw new ChatbotXException(
        "Global Router routes must match the Decision question type",
        "invalidDecisionReference",
      )
    }
    if (
      decision.type === "choice" &&
      config.routes.some(
        (route) =>
          route.type === "choice" &&
          !decision.options.some((option) => option.value === route.value),
      )
    ) {
      throw new ChatbotXException(
        "Global Router choice route is not in the Decision options",
        "invalidDecisionReference",
      )
    }
    if (
      decision.type === "score" &&
      config.routes.some(
        (route) => route.type === "score" && route.to > decision.levels.length,
      )
    ) {
      throw new ChatbotXException(
        "Global Router score route exceeds the configured levels",
        "invalidDecisionReference",
      )
    }
    const metadataIds = config.metadataMappings.map(
      (mapping) => mapping.customFieldId,
    )
    const fields = await decisionRepository.listCustomFieldTypesByIds({
      ids: metadataIds,
      workspaceId: input.workspaceId,
    })
    const fieldTypes = new Map(fields.map((field) => [field.id, field.type]))
    if (fieldTypes.size !== metadataIds.length) {
      throw new ChatbotXException(
        "Global Router metadata field is unavailable",
        "invalidDecisionReference",
      )
    }
    for (const mapping of config.metadataMappings) {
      const validValue =
        (decision.type === "choice" &&
          (mapping.value === "choice" ||
            mapping.value === "confidence" ||
            mapping.value === "selectedProbability")) ||
        (decision.type === "score" &&
          (mapping.value === "score" || mapping.value === "confidence")) ||
        (decision.type === "noul" && mapping.value === "probabilityTrue")
      if (
        !validValue ||
        fieldTypes.get(mapping.customFieldId) !== mapping.customFieldType
      ) {
        throw new ChatbotXException(
          "Global Router metadata mapping is incompatible",
          "invalidDecisionReference",
        )
      }
    }
    const destinations = [
      config.fallback,
      ...config.routes.map((route) => route.destination),
    ]
    for (const destination of destinations) {
      if (destination.type === "flow") {
        const flow = await flowService.findActiveById({
          id: destination.id,
          workspaceId: input.workspaceId,
        })
        if (!flow?.currentVersionId) {
          throw new ChatbotXException(
            "Global Router Flow must be published",
            "invalidDecisionReference",
          )
        }
      } else if (destination.type === "aiAgent") {
        if (
          !(await aiAgentService.findByIdForWorkspace({
            id: destination.id,
            workspaceId: input.workspaceId,
          }))
        ) {
          throw new ChatbotXException(
            "Global Router AI Agent is unavailable",
            "invalidDecisionReference",
          )
        }
      } else if (destination.type === "user") {
        if (
          !(await workspaceMemberService.findMembership({
            userId: destination.id,
            workspaceId: input.workspaceId,
          }))
        ) {
          throw new ChatbotXException(
            "Global Router user is unavailable",
            "invalidDecisionReference",
          )
        }
      } else if (
        !(await inboxTeamService.exists({
          id: destination.id,
          workspaceId: input.workspaceId,
        }))
      ) {
        throw new ChatbotXException(
          "Global Router team is unavailable",
          "invalidDecisionReference",
        )
      }
    }
  }

  async create(input: SaveDecisionProfileInput): Promise<DecisionProfileModel> {
    const { workspaceId, ...formInput } = input
    const parsed = sharedDecisionProfileFormSchema.parse(formInput)
    const connection = await this.requireConnection({
      ...parsed,
      requireModelAvailability: !parsed.globalRouterEnabled,
      workspaceId,
    })
    if (parsed.globalRouterEnabled && parsed.globalRouterConfig) {
      this.assertGlobalRouterCanBeEnabled({
        profileStatus: parsed.status,
      })
      await this.assertGlobalRouterConfiguration({
        config: parsed.globalRouterConfig,
        decision: parsed.decision,
        workspaceId,
      })
    }
    const profileInput = {
      connectionId: connection.id,
      contract: compileContract(parsed),
      description: parsed.description?.trim() || null,
      globalRouterConfig: parsed.globalRouterConfig,
      globalRouterEnabled: false,
      model: parsed.model.trim(),
      name: parsed.name.trim(),
      status: parsed.status,
      thresholdConfig: parsed.thresholdConfig,
      workspaceId,
    }
    if (!parsed.globalRouterEnabled) {
      return await decisionRepository.createProfile(profileInput)
    }
    return await db.transaction(async (tx) => {
      await this.lockGlobalRouterWorkspace(workspaceId, tx)
      const profile = await decisionRepository.createProfile(profileInput, tx)
      if (parsed.globalRouterEnabled) {
        await decisionRepository.disableOtherGlobalRouters(
          { id: profile.id, workspaceId },
          tx,
        )
        return (
          (await decisionRepository.updateProfileForWorkspace(
            {
              globalRouterEnabled: true,
              id: profile.id,
              workspaceId,
            },
            tx,
          )) ?? profile
        )
      }
      return profile
    })
  }

  async update(
    input: SaveDecisionProfileInput & { id: string },
  ): Promise<DecisionProfileModel> {
    const { id, workspaceId, ...formInput } = input
    const existing = await decisionRepository.findProfileByIdForWorkspace({
      id,
      workspaceId,
    })
    if (!existing) {
      throw notFoundException("Decision profile not found")
    }
    const parsed = sharedDecisionProfileFormSchema.parse(formInput)
    const connection = await this.requireConnection({
      ...parsed,
      requireModelAvailability: !parsed.globalRouterEnabled,
      workspaceId,
    })
    if (parsed.globalRouterEnabled && parsed.globalRouterConfig) {
      this.assertGlobalRouterCanBeEnabled({
        profileStatus: parsed.status,
      })
      await this.assertGlobalRouterConfiguration({
        config: parsed.globalRouterConfig,
        decision: parsed.decision,
        workspaceId,
      })
    }
    const updateInput = {
      connectionId: connection.id,
      contract: compileContract(parsed),
      description: parsed.description?.trim() || null,
      globalRouterConfig: parsed.globalRouterConfig,
      globalRouterEnabled: parsed.globalRouterEnabled,
      id,
      model: parsed.model.trim(),
      name: parsed.name.trim(),
      status: parsed.status,
      thresholdConfig: parsed.thresholdConfig,
      workspaceId,
    }
    const updated = parsed.globalRouterEnabled
      ? await db.transaction(async (tx) => {
          await this.lockGlobalRouterWorkspace(workspaceId, tx)
          await decisionRepository.disableOtherGlobalRouters(
            { id, workspaceId },
            tx,
          )
          return await decisionRepository.updateProfileForWorkspace(
            updateInput,
            tx,
          )
        })
      : await decisionRepository.updateProfileForWorkspace(updateInput)
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

  async hasGlobalRouterEnabled(workspaceId: string): Promise<boolean> {
    return await decisionRepository.hasGlobalRouterEnabled({ workspaceId })
  }

  async listForSettings(input: {
    name?: string
    page?: number
    perPage?: number
    sort?: { desc: boolean; id: string }[]
    workspaceId: string
  }) {
    const result = await decisionRepository.listProfilesForSettings(input)
    return {
      ...result,
      data: result.data.map(({ connection, ...profile }) => {
        if (!profile.globalRouterEnabled) {
          return { ...profile, globalRouter: { status: "off" as const } }
        }
        if (profile.status !== "enabled") {
          return {
            ...profile,
            globalRouter: {
              reason: "profileDisabled" as const,
              status: "inactive" as const,
            },
          }
        }
        if (
          connection?.status !== "enabled" ||
          !connection.modelCatalog.includes(profile.model)
        ) {
          return {
            ...profile,
            globalRouter: {
              reason: "connectionUnavailable" as const,
              status: "inactive" as const,
            },
          }
        }
        if (
          !globalRouterConfigSchema.safeParse(profile.globalRouterConfig)
            .success
        ) {
          return {
            ...profile,
            globalRouter: {
              reason: "configInvalid" as const,
              status: "inactive" as const,
            },
          }
        }
        return { ...profile, globalRouter: { status: "active" as const } }
      }),
    }
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
        await this.assertStepMappingCompatible({
          step: parsed.data,
          workspaceId: input.workspaceId,
        })
      }
    }
  }

  async assertStepMappingCompatible(input: {
    step: z.infer<typeof evaluateDecisionStepSchema>
    workspaceId: string
  }) {
    const profile = await this.getForEdit({
      id: input.step.profileId,
      workspaceId: input.workspaceId,
    })
    const question = decisionProfileContractSchema.parse(profile.contract)
      .questions[0]
    const fieldIds = [
      ...input.step.contextCustomFieldIds,
      ...input.step.fieldMappings.map((mapping) => mapping.customFieldId),
    ]
    const fields = await decisionRepository.listCustomFieldTypesByIds({
      ids: fieldIds,
      workspaceId: input.workspaceId,
    })
    const fieldTypes = new Map(
      fields.map((field) => [field.id, field.type] as const),
    )
    if (fields.length !== new Set(fieldIds).size) {
      throw new ChatbotXException(
        "Evaluate Decision context references an unavailable custom field",
        "invalidDecisionReference",
      )
    }
    if (
      new Set(input.step.fieldMappings.map((mapping) => mapping.customFieldId))
        .size !== input.step.fieldMappings.length
    ) {
      throw new ChatbotXException(
        "Evaluate Decision cannot map a custom field more than once",
        "invalidDecisionReference",
      )
    }
    const contextIds = input.step.contextCustomFieldIds
    if (
      contextIds.length < 1 ||
      contextIds.length > 8 ||
      new Set(contextIds).size !== contextIds.length
    ) {
      throw new ChatbotXException(
        "Evaluate Decision requires 1 to 8 unique context fields",
        "invalidDecisionReference",
      )
    }
    for (const mapping of input.step.fieldMappings) {
      const correctValue =
        (mapping.value === "choice" && question?.type === "choice") ||
        (mapping.value === "score" && question?.type === "score") ||
        (mapping.value === "confidence" &&
          (question?.type === "choice" || question?.type === "score")) ||
        (mapping.value === "selectedProbability" &&
          question?.type === "choice") ||
        (mapping.value === "probabilityTrue" && question?.type === "noul")
      if (
        !(
          correctValue &&
          mapping.questionKey === question?.key &&
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
    requireModelAvailability: boolean
    workspaceId: string
  }) {
    const connection = await decisionRepository.findConnectionByIdForWorkspace({
      id: input.connectionId,
      workspaceId: input.workspaceId,
    })
    if (!connection) {
      throw notFoundException("Decision connection not found")
    }
    if (
      input.requireModelAvailability &&
      !connection.modelCatalog.includes(input.model.trim())
    ) {
      throw new ChatbotXException(
        "Decision model is not available on this connection",
        "invalidDecisionModel",
      )
    }
    return connection
  }
}

export const decisionProfileService = new DecisionProfileService()
