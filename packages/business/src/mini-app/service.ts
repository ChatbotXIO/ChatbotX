import {
  and,
  db,
  eq,
  inArray,
  isUniqueViolationError,
  sql,
} from "@chatbotx.io/database/client"
import {
  miniAppRepository,
  miniAppSubmissionRepository,
} from "@chatbotx.io/database/repositories"
import {
  miniAppModel,
  miniAppPublicationModel,
  miniAppSubmissionModel,
} from "@chatbotx.io/database/schema"
import type {
  MiniAppModel,
  MiniAppPublicationModel,
  MiniAppSubmissionModel,
} from "@chatbotx.io/database/types"
import {
  collectCustomFieldMappings,
  collectFileInputNames,
  type FlowJson,
  formatAnswerForCustomField,
  fromFlowJson,
  type MiniAppDefinition,
  MiniAppImportError,
  type MiniAppValidationResult,
  miniAppDefinitionSchema,
  sanitizeMiniAppAnswers,
  toFlowJson,
  validateMiniApp,
} from "@chatbotx.io/mini-app"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { contactService } from "../contact/service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { notFoundException, validationException } from "../errors"
import { logger } from "../logger"
import { miniAppUploadService } from "./upload-service"

const NAME_TAKEN = "Name is already taken"

type MiniAppWriteData = {
  name?: string
  enabled?: boolean
  definition?: MiniAppDefinition
}

/** Parses an editor definition, surfacing structural errors on `definition`. */
const parseDefinition = (definition: unknown): MiniAppDefinition => {
  const parsed = miniAppDefinitionSchema.safeParse(definition)
  if (!parsed.success) {
    throw validationException("definition", "Invalid Mini App definition")
  }
  return parsed.data
}

/** Converts Meta Flow JSON into a definition, surfacing import errors on `flowJson`. */
export const importMiniAppFlowJson = (
  flowJson: FlowJson,
): MiniAppDefinition => {
  try {
    return parseDefinition(fromFlowJson(flowJson))
  } catch (error) {
    if (error instanceof MiniAppImportError) {
      throw validationException("flowJson", "Unsupported Flow JSON", {
        code: error.code,
        path: error.path,
      })
    }
    throw error
  }
}

const rethrowNameTaken = (error: unknown): never => {
  if (isUniqueViolationError(error)) {
    throw validationException("name", NAME_TAKEN)
  }
  throw error
}

class MiniAppService extends BaseService {
  async list(input: {
    workspaceId: string
    keyword?: string | null
    page: number
    perPage: number
    sort?: { id: string; desc: boolean }[] | null
  }) {
    const [data, totalRows] = await Promise.all([
      miniAppRepository.listPaginated(input),
      miniAppRepository.count(input),
    ])
    return { data, pageCount: Math.ceil(totalRows / input.perPage) }
  }

  async findOrFail(input: { workspaceId: string; id: string }) {
    const miniApp = await miniAppRepository.findByIdAndWorkspace(input)
    if (!miniApp) {
      throw notFoundException("Mini App not found")
    }
    return miniApp
  }

  async findUnscoped(id: string): Promise<MiniAppModel | null> {
    return (await miniAppRepository.findById(id)) ?? null
  }

  validate(definition: unknown): MiniAppValidationResult {
    return validateMiniApp(definition)
  }

  async create(input: {
    workspaceId: string
    name: string
    definition: unknown
  }): Promise<MiniAppModel> {
    const definition = parseDefinition(input.definition)
    try {
      const [created] = await db
        .insert(miniAppModel)
        .values({
          id: createId(),
          workspaceId: input.workspaceId,
          name: input.name,
          enabled: true,
          definition,
          flowJson: toFlowJson(definition),
          submissionsCount: 0,
        })
        .returning()
      return created as MiniAppModel
    } catch (error) {
      return rethrowNameTaken(error)
    }
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: MiniAppWriteData,
  ): Promise<MiniAppModel> {
    const miniApp = await this.findOrFail(ctx)
    const definition =
      data.definition === undefined
        ? undefined
        : parseDefinition(data.definition)
    const changes = {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
      ...(definition ? { definition, flowJson: toFlowJson(definition) } : {}),
    }
    if (Object.keys(changes).length === 0) {
      return miniApp
    }
    try {
      const [updated] = await db
        .update(miniAppModel)
        .set(changes)
        .where(
          and(
            eq(miniAppModel.id, miniApp.id),
            eq(miniAppModel.workspaceId, ctx.workspaceId),
          ),
        )
        .returning()
      return updated as MiniAppModel
    } catch (error) {
      return rethrowNameTaken(error)
    }
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<number> {
    if (input.ids.length === 0) {
      return 0
    }
    const deleted = await db
      .delete(miniAppModel)
      .where(
        and(
          eq(miniAppModel.workspaceId, input.workspaceId),
          inArray(miniAppModel.id, input.ids),
        ),
      )
      .returning({ id: miniAppModel.id })
    return deleted.length
  }
}

export const miniAppService = new MiniAppService()

class MiniAppSubmissionService extends BaseService {
  async list(input: {
    workspaceId: string
    miniAppId: string
    page: number
    perPage: number
  }) {
    const [data, totalRows] = await Promise.all([
      miniAppSubmissionRepository.listPaginated(input),
      miniAppSubmissionRepository.count(input),
    ])
    return { data, pageCount: Math.ceil(totalRows / input.perPage), totalRows }
  }

  /**
   * Stores answers from the public runner. Unknown inputs and malformed
   * values are dropped; an empty result is rejected. When the contact is
   * known, mapped inputs are then copied into their custom fields.
   */
  async create(input: {
    miniApp: Pick<MiniAppModel, "id" | "workspaceId" | "definition">
    contactId?: string | null
    answers: unknown
    /** Visitor's browser zone, anchoring answers written to date fields. */
    sourceTimezone?: string
  }): Promise<MiniAppSubmissionModel> {
    const answers = sanitizeMiniAppAnswers(
      input.miniApp.definition,
      input.answers,
    )
    if (!answers || Object.keys(answers).length === 0) {
      throw validationException("answers", "No valid answers")
    }
    // The token may outlive the contact; a deleted contact submits anonymously.
    const contact = input.contactId
      ? await contactService.findById({
          workspaceId: input.miniApp.workspaceId,
          id: input.contactId,
        })
      : undefined
    const contactId = contact?.id ?? null
    const fileInputNames = collectFileInputNames(input.miniApp.definition)
    const submission = await db.transaction(async (tx) => {
      const submissionId = createId()
      await tx.insert(miniAppSubmissionModel).values({
        id: submissionId,
        workspaceId: input.miniApp.workspaceId,
        miniAppId: input.miniApp.id,
        contactId,
        source: "web",
        answers,
      })
      // File inputs submit upload ids; swap them for the files they name.
      for (const [name, value] of Object.entries(answers)) {
        if (fileInputNames.has(name) && Array.isArray(value)) {
          answers[name] = await miniAppUploadService.claimForSubmission({
            tx,
            miniApp: input.miniApp,
            contactId,
            submissionId,
            inputName: name,
            uploadIds: value as string[],
          })
        }
      }
      const [created] = await tx
        .update(miniAppSubmissionModel)
        .set({ answers })
        .where(eq(miniAppSubmissionModel.id, submissionId))
        .returning()
      await tx
        .update(miniAppModel)
        .set({ submissionsCount: sql`${miniAppModel.submissionsCount} + 1` })
        .where(eq(miniAppModel.id, input.miniApp.id))
      return created as MiniAppSubmissionModel
    })
    if (contact) {
      await this.writeCustomFields({
        workspaceId: input.miniApp.workspaceId,
        contactId: contact.id,
        definition: input.miniApp.definition,
        answers,
        sourceTimezone: input.sourceTimezone,
      })
    }
    return submission
  }

  /**
   * Copies mapped answers into the contact's custom fields. Runs after the
   * submission is stored, and a rejected value (e.g. text into a number
   * field) is logged rather than failing the visitor's submit.
   */
  private async writeCustomFields(input: {
    workspaceId: string
    contactId: string
    definition: MiniAppDefinition
    answers: Record<string, unknown>
    sourceTimezone?: string
  }): Promise<void> {
    const fields = Object.entries(
      collectCustomFieldMappings(input.definition),
    ).flatMap(([name, customFieldId]) => {
      const value = formatAnswerForCustomField(input.answers[name])
      return value === null ? [] : [{ customFieldId, value }]
    })
    if (fields.length === 0) {
      return
    }
    try {
      await contactCustomFieldService.setValues({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        fields,
        sourceTimezone: input.sourceTimezone,
      })
    } catch (err) {
      logger.warn(
        { err, contactId: input.contactId },
        "Mini App answers not written to custom fields",
      )
    }
  }
}

export const miniAppSubmissionService = new MiniAppSubmissionService()

class MiniAppPublicationService extends BaseService {
  async findForIntegration(input: {
    miniAppId: string
    integrationWhatsappId: string
  }): Promise<MiniAppPublicationModel | null> {
    return (
      (await db.query.miniAppPublicationModel.findFirst({
        where: {
          miniAppId: input.miniAppId,
          integrationWhatsappId: input.integrationWhatsappId,
        },
      })) ?? null
    )
  }

  /** Every WhatsApp publication of the workspace's given Mini Apps. */
  async listForMiniApps(input: {
    workspaceId: string
    miniAppIds: string[]
  }): Promise<MiniAppPublicationModel[]> {
    if (input.miniAppIds.length === 0) {
      return []
    }
    return await db.query.miniAppPublicationModel.findMany({
      where: {
        miniAppId: { in: input.miniAppIds },
        miniApp: { workspaceId: input.workspaceId },
      },
    })
  }

  /** Records the outcome of a publish attempt (one row per Mini App + number). */
  async record(input: {
    miniAppId: string
    integrationWhatsappId: string
    whatsappFlowId: string | null
    sourceId: string
    status: string
    validationErrors: unknown[]
    published: boolean
  }): Promise<MiniAppPublicationModel> {
    const values = {
      whatsappFlowId: input.whatsappFlowId,
      sourceId: input.sourceId,
      status: input.status,
      validationErrors: input.validationErrors,
      ...(input.published ? { publishedAt: new Date() } : {}),
    }
    const [row] = await db
      .insert(miniAppPublicationModel)
      .values({
        id: createId(),
        miniAppId: input.miniAppId,
        integrationWhatsappId: input.integrationWhatsappId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [
          miniAppPublicationModel.miniAppId,
          miniAppPublicationModel.integrationWhatsappId,
        ],
        set: values,
      })
      .returning()
    return row as MiniAppPublicationModel
  }
}

export const miniAppPublicationService = new MiniAppPublicationService()
