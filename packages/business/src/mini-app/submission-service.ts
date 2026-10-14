import { type DatabaseClient, db, eq, sql } from "@chatbotx.io/database/client"
import {
  type MiniAppSubmissionListInput,
  miniAppSubmissionRepository,
} from "@chatbotx.io/database/repositories"
import {
  miniAppModel,
  miniAppSubmissionModel,
} from "@chatbotx.io/database/schema"
import type {
  MiniAppModel,
  MiniAppSubmissionModel,
} from "@chatbotx.io/database/types"
import {
  collectCustomFieldMappings,
  collectFileInputNames,
  collectInputNames,
  findScreen,
  formatAnswerForCustomField,
  type MiniAppAnswerValue,
  type MiniAppDefinition,
  sanitizeMiniAppAnswers,
} from "@chatbotx.io/mini-app"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import {
  contactCustomFieldService,
  type PendingContactCustomFieldChange,
} from "../contact-custom-field/service"
import { validationException } from "../errors"
import { logger } from "../logger"
import { miniAppUploadService } from "./upload-service"
import { findVisitorContactId } from "./visitor-contact"

type SubmittedMiniApp = Pick<MiniAppModel, "id" | "workspaceId" | "definition">

type CustomFieldValue = { customFieldId: string; value: string }

/** The mapped answers, as the text each custom field receives. */
const customFieldValues = (
  definition: MiniAppDefinition,
  answers: Record<string, unknown>,
): CustomFieldValue[] =>
  Object.entries(collectCustomFieldMappings(definition)).flatMap(
    ([name, customFieldId]) => {
      const value = formatAnswerForCustomField(answers[name])
      return value === null ? [] : [{ customFieldId, value }]
    },
  )

class MiniAppSubmissionService extends BaseService {
  async list(input: MiniAppSubmissionListInput) {
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
    miniApp: SubmittedMiniApp
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
    const contactId = await findVisitorContactId({
      workspaceId: input.miniApp.workspaceId,
      contactId: input.contactId,
    })
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
      await this.claimFileAnswers({
        tx,
        miniApp: input.miniApp,
        contactId,
        submissionId,
        answers,
      })
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
    if (contactId) {
      await this.writeCustomFields({
        workspaceId: input.miniApp.workspaceId,
        contactId,
        fields: customFieldValues(input.miniApp.definition, answers),
        sourceTimezone: input.sourceTimezone,
      })
    }
    return submission
  }

  /** File inputs submit upload ids; swaps them, in place, for the files they name. */
  private async claimFileAnswers(input: {
    tx: DatabaseClient
    miniApp: SubmittedMiniApp
    contactId: string | null
    submissionId: string
    answers: Record<string, MiniAppAnswerValue>
  }): Promise<void> {
    const fileInputNames = collectFileInputNames(input.miniApp.definition)
    for (const [name, value] of Object.entries(input.answers)) {
      if (fileInputNames.has(name) && Array.isArray(value)) {
        input.answers[name] = await miniAppUploadService.claimForSubmission({
          tx: input.tx,
          miniApp: input.miniApp,
          contactId: input.contactId,
          submissionId: input.submissionId,
          inputName: name,
          uploadIds: value as string[],
        })
      }
    }
  }

  /**
   * Saves one screen's mapped answers to the contact's custom fields as the
   * visitor moves on, so the next screens already show the new values. File
   * inputs wait for the final submit, which claims their uploads. Returns
   * whether the contact is known (anonymous visitors save nothing).
   */
  async saveScreenAnswers(input: {
    miniApp: Pick<MiniAppModel, "workspaceId" | "definition">
    contactId?: string | null
    screenKey: string
    answers: unknown
    sourceTimezone?: string
  }): Promise<boolean> {
    const { definition, workspaceId } = input.miniApp
    const screen = findScreen(definition, input.screenKey)
    const contactId =
      screen &&
      (await findVisitorContactId({ workspaceId, contactId: input.contactId }))
    if (!(screen && contactId)) {
      return false
    }
    const screenNames = new Set(collectInputNames(screen))
    const fileInputNames = collectFileInputNames(definition)
    const screenAnswers = Object.fromEntries(
      Object.entries(
        sanitizeMiniAppAnswers(definition, input.answers) ?? {},
      ).filter(([name]) => screenNames.has(name) && !fileInputNames.has(name)),
    )
    await this.writeCustomFields({
      workspaceId,
      contactId,
      fields: customFieldValues(definition, screenAnswers),
      sourceTimezone: input.sourceTimezone,
    })
    return true
  }

  /**
   * Copies mapped answers into the contact's custom fields in one
   * transaction. A rejected value (e.g. text into a number field) is logged
   * and skipped, never dropping the other fields or failing the visitor's
   * submit. Events go out and the contact cache is cleared once, after the
   * commit.
   */
  private async writeCustomFields(input: {
    workspaceId: string
    contactId: string
    fields: CustomFieldValue[]
    sourceTimezone?: string
  }): Promise<void> {
    if (input.fields.length === 0) {
      return
    }
    const changes = await db.transaction((tx) =>
      this.writeFieldsSkippingRejected(tx, input),
    )
    await contactCustomFieldService.emitCustomFieldChanges({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      changes,
    })
  }

  /**
   * Writes all fields behind one savepoint; when one value is rejected,
   * retries field by field (each behind its own savepoint) to skip just it.
   */
  private async writeFieldsSkippingRejected(
    tx: DatabaseClient,
    input: {
      workspaceId: string
      contactId: string
      fields: CustomFieldValue[]
      sourceTimezone?: string
    },
  ): Promise<PendingContactCustomFieldChange[]> {
    const writeFields = (fields: CustomFieldValue[]) =>
      tx.transaction((savepoint) =>
        contactCustomFieldService.setValuesInTransaction(
          {
            workspaceId: input.workspaceId,
            contactId: input.contactId,
            fields,
            sourceTimezone: input.sourceTimezone,
          },
          savepoint,
        ),
      )
    try {
      return await writeFields(input.fields)
    } catch {
      // Retried field by field below to find and skip the rejected value.
    }
    const written: PendingContactCustomFieldChange[] = []
    for (const field of input.fields) {
      try {
        written.push(...(await writeFields([field])))
      } catch (err) {
        logger.warn(
          {
            err,
            contactId: input.contactId,
            customFieldId: field.customFieldId,
          },
          "Mini App answer not written to its custom field",
        )
      }
    }
    return written
  }
}

export const miniAppSubmissionService = new MiniAppSubmissionService()
