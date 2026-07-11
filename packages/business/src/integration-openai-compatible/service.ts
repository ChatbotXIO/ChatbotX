import { and, db, eq, isDatabaseError } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenaiCompatibleModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import {
  normalizeOpenaiCompatibleBaseUrl,
  validateOpenaiCompatibleBaseUrlForEnvironment,
} from "./validate-base-url"

const PRESET_UNIQUE_INDEX = "IntegrationOpenaiCompatible_workspaceId_preset_key"

export class OpenaiCompatiblePresetAlreadyConnectedError extends Error {
  constructor() {
    super("OpenAI-compatible preset is already connected")
    this.name = "OpenaiCompatiblePresetAlreadyConnectedError"
  }
}

export const isOpenaiCompatiblePresetAlreadyConnectedError = (
  error: unknown,
): error is OpenaiCompatiblePresetAlreadyConnectedError =>
  error instanceof OpenaiCompatiblePresetAlreadyConnectedError

const isPresetUniqueViolation = (error: unknown): boolean =>
  isDatabaseError(error) &&
  error.cause.code === "23505" &&
  "constraint" in error.cause &&
  error.cause.constraint === PRESET_UNIQUE_INDEX

export type ConnectOpenaiCompatibleInput = {
  workspaceId: string
  name: string
  preset: string
  baseURL: string
  defaultModel: string
  apiKey: string
  autoReply?: boolean
  enabled?: boolean
}

export type UpdateOpenaiCompatibleInput = Partial<
  Omit<ConnectOpenaiCompatibleInput, "workspaceId">
>

class IntegrationOpenaiCompatibleService extends BaseService {
  listByWorkspaceId(workspaceId: string) {
    return db.query.integrationOpenaiCompatibleModel.findMany({
      where: { workspaceId },
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    })
  }

  findByWorkspaceIdAndId(props: { workspaceId: string; id: string }) {
    return db.query.integrationOpenaiCompatibleModel.findFirst({
      where: { workspaceId: props.workspaceId, id: props.id },
    })
  }

  private async ensurePresetAvailable(props: {
    workspaceId: string
    preset?: string
    excludeId?: string
  }) {
    if (!props.preset || props.preset === "custom") {
      return
    }

    const existing = await db.query.integrationOpenaiCompatibleModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        preset: props.preset,
      },
      columns: { id: true },
    })

    if (existing.some((row) => row.id !== props.excludeId)) {
      throw new OpenaiCompatiblePresetAlreadyConnectedError()
    }
  }

  async connect(props: ConnectOpenaiCompatibleInput) {
    const auth = this.createAuth(props.apiKey)
    const baseURL = await validateOpenaiCompatibleBaseUrlForEnvironment(
      props.baseURL,
    )

    await this.ensurePresetAvailable({
      workspaceId: props.workspaceId,
      preset: props.preset,
    })

    try {
      await db.transaction(async (tx) => {
        const [integration] = await tx
          .insert(integrationModel)
          .values({
            id: createId(),
            workspaceId: props.workspaceId,
            integrationType: "openaiCompatible",
          })
          .returning()

        if (!integration) {
          throw new Error("Failed to create integration record")
        }

        await tx.insert(integrationOpenaiCompatibleModel).values({
          id: createId(),
          auth,
          autoReply: props.autoReply ?? false,
          baseURL,
          defaultModel: props.defaultModel,
          enabled: props.enabled ?? true,
          integrationId: integration.id,
          name: props.name,
          preset: props.preset,
          workspaceId: props.workspaceId,
        })
      })
    } catch (error) {
      if (isPresetUniqueViolation(error)) {
        throw new OpenaiCompatiblePresetAlreadyConnectedError()
      }
      throw error
    }
  }

  async update(
    workspaceId: string,
    id: string,
    data: UpdateOpenaiCompatibleInput,
  ) {
    const existing = await this.findByWorkspaceIdAndId({ workspaceId, id })
    if (!existing) {
      throw new Error("OpenAI-compatible integration not found")
    }

    await this.ensurePresetAvailable({
      workspaceId,
      preset: data.preset,
      excludeId: id,
    })

    const { apiKey, baseURL: rawBaseURL, ...rest } = data
    let baseURL: string | undefined
    if (rawBaseURL !== undefined) {
      const normalizedBaseUrl = normalizeOpenaiCompatibleBaseUrl(rawBaseURL)
      baseURL =
        normalizedBaseUrl === existing.baseURL
          ? normalizedBaseUrl
          : await validateOpenaiCompatibleBaseUrlForEnvironment(
              normalizedBaseUrl,
            )
    }

    try {
      await db
        .update(integrationOpenaiCompatibleModel)
        .set({
          ...rest,
          ...(baseURL === undefined ? {} : { baseURL }),
          ...(apiKey === undefined ? {} : { auth: this.createAuth(apiKey) }),
        })
        .where(
          and(
            eq(integrationOpenaiCompatibleModel.id, id),
            eq(integrationOpenaiCompatibleModel.workspaceId, workspaceId),
          ),
        )
    } catch (error) {
      if (isPresetUniqueViolation(error)) {
        throw new OpenaiCompatiblePresetAlreadyConnectedError()
      }
      throw error
    }
  }

  async disconnect(workspaceId: string, id: string) {
    const existing = await this.findByWorkspaceIdAndId({ workspaceId, id })
    if (!existing) {
      return
    }
    await db
      .delete(integrationModel)
      .where(eq(integrationModel.id, existing.integrationId))
  }

  private createAuth(apiKey?: string | null): SecretTextAuthValue | null {
    const secretText = apiKey?.trim()
    if (!secretText) {
      return null
    }
    return {
      authType: AuthType.secretText,
      secretText,
    }
  }
}

export const integrationOpenaiCompatibleService =
  new IntegrationOpenaiCompatibleService()
