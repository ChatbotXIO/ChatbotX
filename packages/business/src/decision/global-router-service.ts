import { db } from "@chatbotx.io/database/client"
import { decisionRepository } from "@chatbotx.io/database/repositories"
import type {
  DecisionConnectionModel,
  DecisionProfileModel,
} from "@chatbotx.io/database/types"
import {
  type GlobalRouterConfig,
  type GlobalRouterDestination,
  globalRouterConfigSchema,
} from "@chatbotx.io/decision-config"
import { normalizeError } from "universal-error-normalizer"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { logger } from "../logger"
import { type DecisionAnswer, decisionProfileContractSchema } from "./contracts"

type UsableRouter = {
  config: GlobalRouterConfig
  connection: DecisionConnectionModel
  profile: DecisionProfileModel
  status: "usable"
}

export type EnabledGlobalRouter =
  | { status: "absent" }
  | {
      reason: "connectionUnavailable" | "configInvalid" | "profileDisabled"
      status: "invalid"
    }
  | UsableRouter

const metadataValue = (
  answer: DecisionAnswer,
  value: GlobalRouterConfig["metadataMappings"][number]["value"],
) => {
  if (value === "choice" && answer.type === "choice") {
    return answer.choice
  }
  if (value === "score" && answer.type === "score") {
    return String(answer.score)
  }
  if (value === "probabilityTrue" && answer.type === "noul") {
    return String(answer.probabilityTrue)
  }
  if (value === "confidence" && answer.confidence !== undefined) {
    return String(answer.confidence)
  }
  if (value === "selectedProbability" && answer.type === "choice") {
    const probability = answer.probabilities?.[answer.choice]
    if (probability !== undefined) {
      return String(probability)
    }
  }
  throw new Error(
    "Global Router answer does not support configured metadata mapping",
  )
}

class GlobalRouterService {
  async findEnabledForWorkspace(
    workspaceId: string,
  ): Promise<EnabledGlobalRouter> {
    const row = await decisionRepository.findGlobalRouterProfile({
      workspaceId,
    })
    if (!row) {
      return { status: "absent" }
    }
    if (row.profile.status !== "enabled") {
      return { reason: "profileDisabled", status: "invalid" }
    }
    if (
      row.connection?.status !== "enabled" ||
      !row.connection.modelCatalog.includes(row.profile.model)
    ) {
      return { reason: "connectionUnavailable", status: "invalid" }
    }
    const config = globalRouterConfigSchema.safeParse(
      row.profile.globalRouterConfig,
    )
    if (!config.success) {
      return { reason: "configInvalid", status: "invalid" }
    }
    return {
      config: config.data,
      connection: row.connection,
      profile: row.profile,
      status: "usable",
    }
  }

  resolveRoute(input: {
    answer: DecisionAnswer
    config: GlobalRouterConfig
    contract: DecisionProfileModel["contract"]
  }): {
    destination: GlobalRouterDestination | null
    invalid?: boolean
    reason?: "thresholdUnmet"
  } {
    const question = decisionProfileContractSchema.parse(input.contract)
      .questions[0]
    const answer = input.answer
    if (!question || question.type !== answer.type) {
      return { destination: null, invalid: true }
    }
    if (answer.type === "choice" && question.type === "choice") {
      return {
        destination:
          input.config.routes.find(
            (route) => route.type === "choice" && route.value === answer.choice,
          )?.destination ?? null,
      }
    }
    if (answer.type === "score" && question.type === "score") {
      if (
        !Number.isInteger(answer.score) ||
        answer.score < 1 ||
        answer.score > question.levels.length
      ) {
        return { destination: null, invalid: true }
      }
      return {
        destination:
          input.config.routes.find(
            (route) =>
              route.type === "score" &&
              answer.score >= route.from &&
              answer.score <= route.to,
          )?.destination ?? null,
      }
    }
    if (answer.type !== "noul") {
      return { destination: null, invalid: true }
    }
    let value: boolean | null = null
    if (answer.probabilityTrue >= input.config.noul.trueMinimum) {
      value = true
    } else if (answer.probabilityTrue <= input.config.noul.falseMaximum) {
      value = false
    }
    if (value === null) {
      return { destination: null, reason: "thresholdUnmet" }
    }
    return {
      destination:
        input.config.routes.find(
          (route) => route.type === "noul" && route.value === value,
        )?.destination ?? null,
    }
  }

  async writeMetadata(input: {
    answer: DecisionAnswer
    config: GlobalRouterConfig
    contactId: string
    contactInboxId: string
    workspaceId: string
  }): Promise<{ status: "failed" | "skipped" | "written" }> {
    if (input.config.metadataMappings.length === 0) {
      return { status: "skipped" }
    }
    try {
      const changes = await db.transaction(async (tx) => {
        const ids = input.config.metadataMappings.map(
          (mapping) => mapping.customFieldId,
        )
        const fields = await decisionRepository.listCustomFieldTypesByIds(
          { ids, workspaceId: input.workspaceId },
          tx,
        )
        const fieldTypeById = new Map(
          fields.map((field) => [field.id, field.type]),
        )
        const values = input.config.metadataMappings.map((mapping) => {
          if (
            fieldTypeById.get(mapping.customFieldId) !== mapping.customFieldType
          ) {
            throw new Error("Global Router metadata custom field drifted")
          }
          return {
            customFieldId: mapping.customFieldId,
            value: metadataValue(input.answer, mapping.value),
          }
        })
        return await contactCustomFieldService.setValuesInTransaction(
          {
            contactId: input.contactId,
            contactInboxId: input.contactInboxId,
            fields: values,
            workspaceId: input.workspaceId,
          },
          tx,
        )
      })
      await contactCustomFieldService.emitCustomFieldChanges({
        changes,
        contactId: input.contactId,
        contactInboxId: input.contactInboxId,
        workspaceId: input.workspaceId,
      })
      return { status: "written" }
    } catch (error) {
      logger.error(
        {
          err: normalizeError(error),
          contactId: input.contactId,
          contactInboxId: input.contactInboxId,
          workspaceId: input.workspaceId,
        },
        "Global Router metadata write failed",
      )
      return { status: "failed" }
    }
  }
}

export const globalRouterService = new GlobalRouterService()
