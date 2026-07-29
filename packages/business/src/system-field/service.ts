import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  type MeSystemFieldPayload,
  meSystemFieldPayload,
  type SystemFieldPayload,
  type SystemFieldRowType,
} from "@chatbotx.io/database/partials"
import { systemFieldModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  SystemFieldModel,
  TagModel,
} from "@chatbotx.io/database/types"
import {
  type MeLinkParams,
  verifyMeLink,
} from "@chatbotx.io/encryption/link-signature"
import { uploader } from "@chatbotx.io/filesystem"
import { normalizeGender } from "@chatbotx.io/sdk"
import { BaseService } from "../base.service"
import { contactService } from "../contact/service"
import { contactCustomFieldService } from "../contact-custom-field/service"
import {
  contactInboxService,
  getContactInboxSinceTime,
} from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { logger } from "../logger"
import { messageService } from "../message/service"
import { resolveTenantSettings } from "../platform/settings"
import { tagService } from "../tag/service"
import { toPublicStorageUrl } from "../utils"
import { workspaceService } from "../workspace/service"

export type MePrivacyParams = MeLinkParams & {
  hash: string | null | undefined
}

export type MePrivacyData = {
  contact: {
    id: string
    avatarUrl: string | null
    email: string | null
    firstName: string | null
    fullName: string | null
    gender: string | null
    lastName: string | null
    locale: string | null
    phoneNumber: string | null
    timezone: string | null
  }
  customFields: { name: string; value: string }[]
  language: string
  params: MePrivacyParams
  sourceId: string
  tags: Pick<TagModel, "id" | "name">[]
}

export type MeExportData = {
  data: {
    id: string
    first_name: string | null
    last_name: string | null
    full_name: string | null
    email: string
    phone: string
    locale: string | null
    timezone: string | null
    gender: string
    profile_pic: string | null
  }
  messages: string[]
  generated: string
}

type VerifiedMeContext = {
  contact: ContactModel
  contactInbox: ContactInboxModel
  conversation: ConversationModel | null
  payload: MeSystemFieldPayload
  row: SystemFieldModel
}

const DEFAULT_GENDER_LABEL_LANGUAGE = "en"
const LANGUAGE_SUBTAG_RE = /[-_]/

type GenderKey = "male" | "female" | "unknown"

// Sentence-opening salutation labels for `{{gender}}`. Defined here, not in the
// builder's messages/*.json, because the worker loads this package without a
// next-intl runtime. Non-Vietnamese workspaces fall back to English.
const GENDER_LABELS: Record<string, Record<GenderKey, string>> = {
  en: { female: "Female", male: "Male", unknown: "Male/Female" },
  vi: { female: "Chị", male: "Anh", unknown: "Anh/Chị" },
}

export const resolveGenderLabel = (
  language: string | null | undefined,
  gender: string | null,
): string => {
  // Primary subtag only, so a legacy "vi-VN" row still localises.
  const [subtag] = (language || DEFAULT_GENDER_LABEL_LANGUAGE)
    .toLowerCase()
    .split(LANGUAGE_SUBTAG_RE)
  const labels =
    GENDER_LABELS[subtag] ?? GENDER_LABELS[DEFAULT_GENDER_LABEL_LANGUAGE]
  const normalized = normalizeGender(gender ?? undefined)
  return normalized === "male" || normalized === "female"
    ? labels[normalized]
    : labels.unknown
}

const toGeneratedUtc = (): string =>
  `${new Date().toISOString().slice(0, 19).replace("T", " ")} (UTC)`

const payloadMatchesParams = (
  payload: MeSystemFieldPayload,
  params: MeLinkParams,
): boolean =>
  payload.workspaceId === params.workspaceId &&
  payload.sourceId === params.sourceId &&
  payload.integrationId === params.integrationId

class SystemFieldService extends BaseService {
  async create(props: {
    type: SystemFieldRowType
    payload: SystemFieldPayload
    tx?: DatabaseClient
  }): Promise<SystemFieldModel> {
    const { type, payload, tx = db } = props
    const [row] = await tx
      .insert(systemFieldModel)
      .values({ type, payload })
      .returning()
    return row
  }

  async findById(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<SystemFieldModel | null> {
    const { id, tx = db } = props
    const [row] = await tx
      .select()
      .from(systemFieldModel)
      .where(eq(systemFieldModel.id, id))
      .limit(1)
    return row ?? null
  }

  async deleteById(props: { id: string; tx?: DatabaseClient }): Promise<void> {
    const { id, tx = db } = props
    await tx.delete(systemFieldModel).where(eq(systemFieldModel.id, id))
  }

  async getMePrivacyData(
    params: MePrivacyParams,
  ): Promise<MePrivacyData | null> {
    const context = await this.loadVerifiedMeContext(params)
    if (!context) {
      return null
    }

    const [tags, customFields, settings, workspace] = await Promise.all([
      tagService.listByContactId({ contactId: context.payload.contactId }),
      contactCustomFieldService.listWithDefinitions({
        contactId: context.payload.contactId,
      }),
      resolveTenantSettings({ workspaceId: context.payload.workspaceId }),
      workspaceService.findById({ id: context.payload.workspaceId }),
    ])

    return {
      contact: {
        id: context.contact.id,
        avatarUrl: toPublicStorageUrl(
          context.contact.avatar,
          settings.storageUrl,
        ),
        email: context.contact.email,
        firstName: context.contact.firstName,
        fullName: context.contact.fullName,
        gender: context.contact.gender,
        lastName: context.contact.lastName,
        locale: context.contact.locale,
        phoneNumber: context.contact.phoneNumber,
        timezone: context.contact.timezone,
      },
      customFields,
      language: workspace.language,
      params,
      sourceId: context.contactInbox.sourceId,
      tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
    }
  }

  async buildMeExport(params: MePrivacyParams): Promise<MeExportData | null> {
    const context = await this.loadVerifiedMeContext(params)
    if (!context) {
      return null
    }

    const messagesPromise = messageService.listIncomingTextsByContactInbox({
      contactInboxId: context.contactInbox.id,
      sinceTime: getContactInboxSinceTime(context.contactInbox),
      workspaceId: context.payload.workspaceId,
    })

    const [messages, settings, workspace] = await Promise.all([
      messagesPromise,
      resolveTenantSettings({ workspaceId: context.payload.workspaceId }),
      workspaceService.findById({ id: context.payload.workspaceId }),
    ])

    return {
      data: {
        id: context.contactInbox.sourceId,
        first_name: context.contact.firstName,
        last_name: context.contact.lastName,
        full_name: context.contact.fullName,
        email: context.contact.email ?? "",
        phone: context.contact.phoneNumber ?? "",
        locale: context.contact.locale,
        timezone: context.contact.timezone,
        gender: resolveGenderLabel(workspace.language, context.contact.gender),
        profile_pic: toPublicStorageUrl(
          context.contact.avatar,
          settings.storageUrl,
        ),
      },
      messages,
      generated: toGeneratedUtc(),
    }
  }

  async deleteMeData(params: MePrivacyParams): Promise<void> {
    const context = await this.loadVerifiedMeContext(params)
    if (!context) {
      return
    }

    const deleteSinceTime = getContactInboxSinceTime(context.contactInbox)

    const { attachmentPaths } =
      await messageService.hardDeleteAllByContactInbox({
        contactInboxId: context.contactInbox.id,
        sinceTime: deleteSinceTime,
        workspaceId: context.payload.workspaceId,
      })

    const deleteResults = await Promise.allSettled(
      attachmentPaths.map((path) => uploader.deleteObject(path)),
    )
    for (const result of deleteResults) {
      if (result.status === "rejected") {
        logger.warn(
          { err: result.reason, contactInboxId: context.contactInbox.id },
          "SystemField me data attachment deletion failed",
        )
      }
    }

    // Synchronous v1 is bounded to one contact-inbox; move to BullMQ if this
    // path needs to erase very large histories.
    await db.transaction(async (tx) => {
      // Clearing phone/email intentionally does not emit contactInfoUpdated. If
      // that semantic changes, emit after this transaction commits.
      await contactService.update(
        {
          workspaceId: context.payload.workspaceId,
          id: context.payload.contactId,
        },
        { phoneNumber: null, email: null },
        tx,
      )
      await tagService.detachAllFromContact({
        workspaceId: context.payload.workspaceId,
        contactId: context.payload.contactId,
        tx,
      })
      await contactCustomFieldService.clearByContactId({
        workspaceId: context.payload.workspaceId,
        contactId: context.payload.contactId,
        tx,
      })
      await this.deleteById({ id: context.row.id, tx })
    })
  }

  private async loadVerifiedMeContext(
    params: MePrivacyParams,
  ): Promise<VerifiedMeContext | null> {
    const signedParams = {
      workspaceId: params.workspaceId,
      sourceId: params.sourceId,
      integrationId: params.integrationId,
      formId: params.formId,
    }
    if (!verifyMeLink(signedParams, params.hash)) {
      return null
    }

    const row = await this.findById({ id: params.formId })
    if (row?.type !== "me") {
      return null
    }
    const parsedPayload = meSystemFieldPayload.safeParse(row.payload)
    if (!parsedPayload.success) {
      return null
    }
    const payload = parsedPayload.data
    if (!payloadMatchesParams(payload, signedParams)) {
      return null
    }

    const [contact, contactInbox] = await Promise.all([
      contactService.findById({
        workspaceId: payload.workspaceId,
        id: payload.contactId,
      }),
      contactInboxService.findByUncached({
        where: { id: payload.contactInboxId },
      }),
    ])

    if (!(contact && contactInbox)) {
      return null
    }

    if (
      contactInbox.contactId !== payload.contactId ||
      contactInbox.sourceId !== payload.sourceId ||
      contactInbox.channel !== payload.channel
    ) {
      return null
    }

    const conversation = payload.conversationId
      ? await conversationService.findByUncached({
          where: {
            id: payload.conversationId,
            workspaceId: payload.workspaceId,
            contactId: payload.contactId,
          },
        })
      : null

    if (payload.conversationId && !conversation) {
      return null
    }

    return {
      contact,
      contactInbox,
      conversation: conversation ?? null,
      payload,
      row,
    }
  }
}

export const systemFieldService = new SystemFieldService()
