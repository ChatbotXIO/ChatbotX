import { db } from "@chatbotx.io/database/client"
import { decisionRepository } from "@chatbotx.io/database/repositories"
import type { EvaluateDecisionStepSchema } from "@chatbotx.io/flow-config"
import { distributedLock, isLockAcquisitionError } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { logger } from "../logger"
import { messageService } from "../message/service"
import {
  compileDecisionProfileRequest,
  normalizeDecisionProviderResponse,
} from "./adapters"
import { decisionConnectionService } from "./connection-service"
import {
  type DecisionAnswer,
  type DecisionResult,
  decisionProfileContractSchema,
} from "./contracts"
import { postDecisionRequest } from "./transport"

const EVALUATION_LOCK_TIMEOUT_SECONDS = 10
const EVALUATION_LOCK_RETRY_TIMEOUT_SECONDS = 0
const INGRESS_LOCK_TIMEOUT_SECONDS = 30

export type EvaluateDecisionOutcome =
  | { status: "success" }
  | { reason: string; status: "skip" }
  | { reason: string; status: "error" }

const outputValue = (input: {
  answer: DecisionAnswer
  value: EvaluateDecisionStepSchema["fieldMappings"][number]["value"]
}): string => {
  const { answer, value } = input
  if (value === "choice" && answer.type === "choice") {
    return answer.choice
  }
  if (value === "score" && answer.type === "score") {
    return String(answer.score)
  }
  if (value === "noul" && answer.type === "noul") {
    return String(answer.noul)
  }
  if (value === "confidence" && answer.confidence !== undefined) {
    return String(answer.confidence)
  }
  if (
    value === "probability" &&
    answer.type === "choice" &&
    answer.probabilities
  ) {
    const probability = answer.probabilities[answer.choice]
    if (probability !== undefined) {
      return String(probability)
    }
  }
  throw new Error("Decision result is missing a mapped diagnostic")
}

class DecisionEvaluationService {
  async evaluateFlow(input: {
    contactId: string
    contactInboxId: string
    conversationId: string
    flowId: string
    step: EvaluateDecisionStepSchema
    triggerMessageCreatedAt?: Date
    triggerMessageId?: string
    workspaceId: string
  }): Promise<EvaluateDecisionOutcome> {
    if (!(input.triggerMessageId && input.triggerMessageCreatedAt)) {
      return { reason: "missingSource", status: "skip" }
    }
    const source = await messageService.findById({
      createdAt: input.triggerMessageCreatedAt,
      id: input.triggerMessageId,
      workspaceId: input.workspaceId,
    })
    if (
      !source ||
      source.conversationId !== input.conversationId ||
      source.messageType !== "incoming" ||
      !source.text?.trim()
    ) {
      return { reason: "invalidSource", status: "skip" }
    }

    const profile = await decisionRepository.findProfileByIdForWorkspace({
      id: input.step.profileId,
      workspaceId: input.workspaceId,
    })
    if (profile?.status !== "enabled") {
      return { reason: "invalidReference", status: "error" }
    }
    const connection = await decisionRepository.findConnectionByIdForWorkspace({
      id: profile.connectionId,
      workspaceId: input.workspaceId,
    })
    if (connection?.status !== "enabled") {
      return { reason: "connectionDisabled", status: "skip" }
    }

    const lockKey = `decision:eval:${input.workspaceId}:${source.id}:${input.flowId}`
    let result: DecisionResult
    try {
      result = await distributedLock.runExclusive({
        fn: async () => {
          const contract = decisionProfileContractSchema.parse(profile.contract)
          decisionConnectionService.assertProfileConnectionOperational({
            connection,
            profile,
            workspaceId: input.workspaceId,
          })
          const credential = await decisionConnectionService.decryptCredential({
            connection,
          })
          const response = await postDecisionRequest({
            authorization: credential.apiKey,
            body: {
              model: profile.model,
              ...compileDecisionProfileRequest(contract),
              state: { currentMessage: source.text },
            },
            endpoint: connection.endpoint,
            providerKind: connection.providerKind,
          })
          if (response.status < 200 || response.status >= 300) {
            throw new Error(
              `Decision provider returned status ${response.status}`,
            )
          }
          const parsed = z.unknown().parse(JSON.parse(response.body))
          return normalizeDecisionProviderResponse({ contract, raw: parsed })
        },
        key: lockKey,
        retryTimeoutInSeconds: EVALUATION_LOCK_RETRY_TIMEOUT_SECONDS,
        timeoutInSeconds: EVALUATION_LOCK_TIMEOUT_SECONDS,
      })
    } catch (error) {
      if (isLockAcquisitionError(error, lockKey)) {
        return { reason: "contention", status: "skip" }
      }
      logger.error(
        {
          err: normalizeError(error),
          connectionId: connection.id,
          flowId: input.flowId,
          workspaceId: input.workspaceId,
        },
        "Decision evaluation failed",
      )
      return { reason: "providerFailure", status: "error" }
    }

    const ingressKey = `ingress:conv:${input.conversationId}`
    try {
      return await distributedLock.runExclusive({
        fn: async () => {
          const latest = await messageService.findByUncached({
            sinceTime: new Date(0),
            where: {
              conversationId: input.conversationId,
              messageType: "incoming",
              workspaceId: input.workspaceId,
            },
          })
          if (!latest || latest.id !== source.id) {
            return { reason: "staleSource", status: "skip" } as const
          }
          const changes = await db.transaction(async (tx) => {
            const fieldIds = input.step.fieldMappings.map(
              (mapping) => mapping.customFieldId,
            )
            const fields = await decisionRepository.listCustomFieldTypesByIds(
              {
                ids: fieldIds,
                workspaceId: input.workspaceId,
              },
              tx,
            )
            const typeById = new Map(
              fields.map((field) => [field.id, field.type]),
            )
            const values = input.step.fieldMappings.map((mapping) => {
              const targetType = typeById.get(mapping.customFieldId)
              if (!targetType || targetType !== mapping.customFieldType) {
                throw new Error(
                  "Decision mapping custom field no longer matches",
                )
              }
              const answer = result.answers[mapping.questionKey]
              if (!answer) {
                throw new Error(
                  "Decision mapping references an unknown question",
                )
              }
              return {
                customFieldId: mapping.customFieldId,
                value: outputValue({
                  answer,
                  value: mapping.value,
                }),
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
          // The outer lock scopes the source freshness read and transaction.
          // Emit only after the transaction has committed successfully.
          await contactCustomFieldService.emitCustomFieldChanges({
            changes,
            contactId: input.contactId,
            contactInboxId: input.contactInboxId,
            decisionFlowOrigin: {
              flowId: input.flowId,
              profileId: input.step.profileId,
            },
            workspaceId: input.workspaceId,
          })
          return { status: "success" } as const
        },
        key: ingressKey,
        retryTimeoutInSeconds: EVALUATION_LOCK_RETRY_TIMEOUT_SECONDS,
        timeoutInSeconds: INGRESS_LOCK_TIMEOUT_SECONDS,
      })
    } catch (error) {
      logger.error(
        {
          err: normalizeError(error),
          flowId: input.flowId,
          workspaceId: input.workspaceId,
        },
        "Decision mapping failed",
      )
      return { reason: "mappingFailure", status: "error" }
    }
  }
}

export const decisionEvaluationService = new DecisionEvaluationService()
