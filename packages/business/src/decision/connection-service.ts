import { decisionRepository } from "@chatbotx.io/database/repositories"
import type {
  DecisionConnectionModel,
  DecisionProfileModel,
} from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import { distributedStore } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { normalizeDecisionProviderResponse } from "./adapters"
import { normalizeCompatibleEndpoint } from "./compatible-url"
import {
  type DecisionConnectionSafe,
  type DecisionCredential,
  decisionConnectionSafeSchema,
  decisionCredentialSchema,
} from "./contracts"
import { postDecisionRequest } from "./transport"

const encryptedCredentialSchema = z.object({ apiKey: z.string() }).strict()
const CONNECTION_TEST_THROTTLE_SECONDS = 30

const aadForConnection = (workspaceId: string, connectionId: string): string =>
  `decision-connection:${workspaceId}:${connectionId}`

const uniqueModels = (models: string[]): string[] => [
  ...new Set(models.map((model) => model.trim()).filter(Boolean)),
]

const toSafeConnection = (
  connection: DecisionConnectionModel,
): DecisionConnectionSafe =>
  decisionConnectionSafeSchema.parse({
    credentialConfigured: true,
    defaultModel: connection.defaultModel,
    endpoint: connection.endpoint,
    id: connection.id,
    lastTest: {
      status: connection.lastTestStatus,
      testedAt: connection.lastTestedAt,
    },
    modelCatalog: connection.modelCatalog,
    name: connection.name,
    providerKind: connection.providerKind,
    status: connection.status,
  })

export type SaveDecisionConnectionInput = {
  credential?: string
  defaultModel?: string | null
  endpoint?: string | null
  modelCatalog: string[]
  name: string
  providerKind: "systemOneCompatible" | "typesafe" | "openrouterDecision"
  workspaceId: string
}

class DecisionConnectionService extends BaseService {
  listSafe(workspaceId: string): Promise<DecisionConnectionSafe[]> {
    return decisionRepository
      .listConnectionsByWorkspaceId(workspaceId)
      .then((connections) => connections.map(toSafeConnection))
  }

  async create(
    input: SaveDecisionConnectionInput,
  ): Promise<DecisionConnectionSafe> {
    const modelCatalog = uniqueModels(input.modelCatalog)
    this.assertModelConfig({
      defaultModel: input.defaultModel,
      modelCatalog,
    })
    const credential = decisionCredentialSchema.parse({
      apiKey: input.credential,
    })
    const endpoint = await this.resolveEndpoint(input)
    const id = createId()
    const encryptedCredential = await encryptUtils.encryptObject(
      credential,
      aadForConnection(input.workspaceId, id),
    )
    const created = await decisionRepository.createConnection({
      credential: encryptedCredential,
      defaultModel: input.defaultModel ?? null,
      endpoint,
      id,
      modelCatalog,
      name: input.name.trim(),
      providerKind: input.providerKind,
      workspaceId: input.workspaceId,
    })
    return toSafeConnection(created)
  }

  async update(
    input: Omit<SaveDecisionConnectionInput, "credential"> & {
      credential?: string
      id: string
    },
  ): Promise<DecisionConnectionSafe> {
    const existing = await decisionRepository.findConnectionByIdForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!existing) {
      throw notFoundException("Decision connection not found")
    }
    const modelCatalog = uniqueModels(input.modelCatalog)
    this.assertModelConfig({
      defaultModel: input.defaultModel,
      modelCatalog,
    })
    const endpoint = await this.resolveEndpoint(input)
    const credential = input.credential?.trim()
      ? await encryptUtils.encryptObject(
          decisionCredentialSchema.parse({ apiKey: input.credential }),
          aadForConnection(input.workspaceId, input.id),
        )
      : undefined
    const updated = await decisionRepository.updateConnectionForWorkspace({
      credential,
      defaultModel: input.defaultModel ?? null,
      endpoint,
      id: input.id,
      modelCatalog,
      name: input.name.trim(),
      providerKind: input.providerKind,
      workspaceId: input.workspaceId,
    })
    if (!updated) {
      throw notFoundException("Decision connection not found")
    }
    return toSafeConnection(updated)
  }

  async setEnabled(input: {
    enabled: boolean
    id: string
    workspaceId: string
  }): Promise<DecisionConnectionSafe> {
    const connection = await decisionRepository.updateConnectionForWorkspace({
      id: input.id,
      status: input.enabled ? "enabled" : "disabled",
      workspaceId: input.workspaceId,
    })
    if (!connection) {
      throw notFoundException("Decision connection not found")
    }
    return toSafeConnection(connection)
  }

  async test(input: { id: string; workspaceId: string }): Promise<{
    code: string
    latencyMs: number
    model: string
    status: "failed" | "passed"
  }> {
    const connection =
      await decisionRepository.findConnectionByIdForWorkspace(input)
    if (!connection) {
      throw notFoundException("Decision connection not found")
    }
    const acquired = await distributedStore.setNumberIfNotExists(
      `decision:connection-test:${input.workspaceId}:${input.id}`,
      1,
      CONNECTION_TEST_THROTTLE_SECONDS,
    )
    if (!acquired) {
      throw new ChatbotXException(
        "Decision connection test is already running or was run recently",
        "decisionConnectionTestThrottled",
        429,
      )
    }
    const model = connection.defaultModel ?? connection.modelCatalog[0]
    if (!model) {
      throw new ChatbotXException(
        "Decision connection has no model",
        "invalidDecisionModel",
      )
    }
    const startedAt = Date.now()
    try {
      const credential = await this.decryptCredential({ connection })
      const contract = {
        inputs: [{ key: "currentMessage" as const, required: true as const }],
        questions: [
          {
            instructions: "Classify the test input.",
            key: "choice_test",
            label: "Choice",
            options: [
              { description: "First test choice.", label: "One", value: "one" },
              {
                description: "Second test choice.",
                label: "Two",
                value: "two",
              },
            ],
            type: "choice" as const,
          },
          {
            instructions: "Score the test input.",
            key: "score_test",
            label: "Score",
            levels: [
              { description: "Low test score.", label: "1", value: 1 },
              { description: "High test score.", label: "2", value: 2 },
            ],
            type: "score" as const,
          },
          {
            falseCriteria: "False",
            instructions: "Evaluate the test input.",
            key: "noul_test",
            label: "Noul",
            trueCriteria: "True",
            type: "noul" as const,
          },
        ],
      }
      const response = await postDecisionRequest({
        authorization: credential.apiKey,
        body: {
          model,
          questions: Object.fromEntries(
            contract.questions.map((question) => [question.key, question]),
          ),
          state: { currentMessage: "Decision connection conformance test" },
        },
        endpoint: connection.endpoint,
        providerKind: connection.providerKind,
      })
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Decision provider returned status ${response.status}`)
      }
      normalizeDecisionProviderResponse({
        contract,
        raw: JSON.parse(response.body),
      })
      const result = {
        code: "ok",
        latencyMs: Date.now() - startedAt,
        model,
        status: "passed" as const,
      }
      await decisionRepository.updateConnectionForWorkspace({
        id: input.id,
        lastTestStatus: result.status,
        lastTestedAt: new Date(),
        workspaceId: input.workspaceId,
      })
      return result
    } catch {
      const result = {
        code: "failed",
        latencyMs: Date.now() - startedAt,
        model,
        status: "failed" as const,
      }
      await decisionRepository.updateConnectionForWorkspace({
        id: input.id,
        lastTestStatus: result.status,
        lastTestedAt: new Date(),
        workspaceId: input.workspaceId,
      })
      return result
    }
  }

  async decryptCredential(input: {
    connection: DecisionConnectionModel
  }): Promise<DecisionCredential> {
    return await encryptUtils.decryptObject(
      input.connection.credential,
      encryptedCredentialSchema,
      aadForConnection(input.connection.workspaceId, input.connection.id),
    )
  }

  assertProfileConnectionOperational(input: {
    connection: DecisionConnectionModel | null
    profile: DecisionProfileModel
    workspaceId: string
  }): void {
    const { connection, profile, workspaceId } = input
    if (
      !connection ||
      connection.workspaceId !== workspaceId ||
      connection.id !== profile.connectionId ||
      connection.status !== "enabled" ||
      !connection.modelCatalog.includes(profile.model)
    ) {
      throw new ChatbotXException(
        "Decision revision has no enabled compatible connection",
        "invalidDecisionReference",
      )
    }
  }

  private assertModelConfig(input: {
    defaultModel?: string | null
    modelCatalog: string[]
  }): void {
    if (input.modelCatalog.length === 0) {
      throw new ChatbotXException(
        "Decision connection must have at least one model",
        "invalidDecisionModel",
      )
    }
    if (
      input.defaultModel &&
      !input.modelCatalog.includes(input.defaultModel.trim())
    ) {
      throw new ChatbotXException(
        "Default decision model must be in the connection catalog",
        "invalidDecisionModel",
      )
    }
  }

  private async resolveEndpoint(input: {
    endpoint?: string | null
    providerKind: "systemOneCompatible" | "typesafe" | "openrouterDecision"
  }): Promise<string | null> {
    if (
      input.providerKind === "typesafe" ||
      input.providerKind === "openrouterDecision"
    ) {
      return null
    }
    if (!input.endpoint) {
      throw new ChatbotXException(
        "System One Compatible requires an endpoint",
        "invalidDecisionEndpoint",
      )
    }
    return await normalizeCompatibleEndpoint(input.endpoint)
  }
}

export const decisionConnectionService = new DecisionConnectionService()
