import {
  botFieldWorkspaceCacheTags,
  workspaceService,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import {
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import {
  FieldReferenceKind,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import { withCache } from "@chatbotx.io/redis"
import { isCouponVariable, resolveCouponVariable } from "./coupon-variable"
import { logger } from "./logger"
import type {
  BotFieldValue,
  ContactCustomFieldValue,
  ReplaceVariableProps,
} from "./schema"
import {
  extractVariables,
  getContactTimezone,
  getSystemFieldValue,
  interpolate,
  RAW_CUSTOM_FIELD_VARIABLE_PREFIX,
  renderCustomFieldValue,
  toRawCustomFieldName,
} from "./utils"

type VariableResolver = {
  readonly matches: (variable: string, context: ReplaceVariableProps) => boolean
  readonly resolve: (
    variable: string,
    context: ReplaceVariableProps,
    timezone: string | null,
  ) => Promise<string> | string
}

const systemFieldResolver: VariableResolver = {
  matches: (variable) =>
    systemFieldTypes.options.includes(variable as SystemFieldType),
  resolve: async (variable, context) =>
    (await getSystemFieldValue(context, variable as SystemFieldType)) ?? "",
}

const rawCustomFieldResolver: VariableResolver = {
  matches: (variable, context) =>
    variable.startsWith(RAW_CUSTOM_FIELD_VARIABLE_PREFIX) &&
    context.customFieldsMap.has(toRawCustomFieldName(variable)),
  resolve: (variable, context) =>
    context.customFieldsMap.get(toRawCustomFieldName(variable))?.value ?? "",
}

const customFieldResolver: VariableResolver = {
  matches: (variable, context) => context.customFieldsMap.has(variable),
  resolve: (variable, context, timezone) => {
    const fieldValue = context.customFieldsMap.get(variable)
    return fieldValue
      ? renderCustomFieldValue(fieldValue.type, fieldValue.value, timezone)
      : ""
  },
}

// Bot fields (Account Fields) are workspace-level, referenced by the
// `bot_field:<id>` token (see `@chatbotx.io/flow-config`'s
// `parseFieldReference`/`formatBotFieldReference`) rather than by name, so
// they never collide with a contact custom field of the same name. `matches`
// requires the id to actually be present in `botFieldsMap` — mirroring
// `customFieldResolver` — so a deleted/unknown bot field id is left as
// literal `{{bot_field:<id>}}` text, exactly like an unknown custom field
// name today.
const botFieldResolver: VariableResolver = {
  matches: (variable, context) => {
    const parsed = parseFieldReference(variable)
    return (
      parsed.kind === FieldReferenceKind.botField &&
      Boolean(context.botFieldsMap?.has(parsed.id))
    )
  },
  resolve: (variable, context, timezone) => {
    const parsed = parseFieldReference(variable)
    if (parsed.kind !== FieldReferenceKind.botField) {
      return ""
    }
    const fieldValue = context.botFieldsMap?.get(parsed.id)
    return fieldValue
      ? renderCustomFieldValue(
          fieldValue.type,
          fieldValue.value ?? "",
          timezone,
        )
      : ""
  },
}

const couponResolver: VariableResolver = {
  matches: (variable) => isCouponVariable(variable),
  resolve: async (variable, context) =>
    await resolveCouponVariable(context, variable),
}

const variableResolvers = [
  systemFieldResolver,
  rawCustomFieldResolver,
  botFieldResolver,
  customFieldResolver,
  couponResolver,
] as const satisfies readonly VariableResolver[]

type GetAllProps = {
  contactId: string
  contactInbox: ContactInboxModel | string
  conversation?: ConversationModel | null
  appointmentId?: string
  workspace?: WorkspaceModel
}

const loadContact = async (contactId: string): Promise<ContactModel> => {
  const contact = await db.query.contactModel.findFirst({
    where: { id: contactId },
  })

  if (!contact) {
    logger.error(`Contact ${contactId} not found`)
    throw new Error("Contact not found")
  }

  return contact
}

const loadInbox = async (
  contactInbox: ContactInboxModel | string,
): Promise<ContactInboxModel | null> => {
  if (typeof contactInbox !== "string") {
    return contactInbox
  }

  return (
    (await db.query.contactInboxModel.findFirst({
      where: { id: contactInbox },
    })) ?? null
  )
}

const loadWorkspace = async (input: {
  contact: ContactModel
  workspace?: WorkspaceModel
}): Promise<WorkspaceModel | null> => {
  if (input.workspace) {
    return input.workspace
  }

  return (
    (await workspaceService.find({
      where: { id: input.contact.workspaceId },
    })) ?? null
  )
}

const loadFields = async (
  contactId: string,
): Promise<Map<string, ContactCustomFieldValue>> => {
  const rows = await db.query.contactCustomFieldModel.findMany({
    where: { contactId },
    with: { customField: true },
  })

  return new Map(
    rows.map((row) => [
      row.customField.name,
      {
        key: row.customField.name,
        type: row.customField.type,
        value: row.value,
        description: row.customField.description ?? "",
      },
    ]),
  )
}

/**
 * Cached, unlike the per-contact loads above: `getAll` runs on every message
 * send / automation step, and bot fields are workspace-global and rarely
 * change — an uncached query here would hit Postgres once per send. The
 * cache subscribes to `botFieldService`'s own invalidation tags, so every
 * bot-field write refreshes it. The short TTL is a safety net on top: tag
 * invalidation is best-effort, and a `getAll` racing a not-yet-committed
 * bot-field-creating transaction (template install invalidates inside its
 * tx) could re-cache the pre-commit map — the TTL caps any such staleness
 * instead of letting it live for the default 24h.
 */
const BOT_FIELDS_CACHE_TTL_SECONDS = 5 * 60

const loadBotFields = async (
  workspaceId: string,
): Promise<Map<string, BotFieldValue>> =>
  await withCache(
    `bot-fields:${workspaceId}:variable-map`,
    async () => {
      const rows = await db.query.botFieldModel.findMany({
        where: { workspaceId },
      })

      return new Map(
        rows.map((row) => [row.id, { type: row.type, value: row.value }]),
      )
    },
    {
      ttl: BOT_FIELDS_CACHE_TTL_SECONDS,
      tags: botFieldWorkspaceCacheTags(workspaceId),
    },
  )

export const contactVariableService = {
  getAll: async (input: GetAllProps): Promise<ReplaceVariableProps> => {
    const [contact, contactInbox, customFieldsMap] = await Promise.all([
      loadContact(input.contactId),
      loadInbox(input.contactInbox),
      loadFields(input.contactId),
    ])
    const [workspace, botFieldsMap] = await Promise.all([
      loadWorkspace({
        contact,
        workspace: input.workspace,
      }),
      loadBotFields(contact.workspaceId),
    ])

    return {
      contact,
      contactInbox,
      conversation: input.conversation ?? null,
      appointmentId: input.appointmentId,
      customFieldsMap,
      botFieldsMap,
      workspace,
    }
  },

  replaceAll: async (props: {
    text: string
    variables: ReplaceVariableProps
  }): Promise<string> => {
    const { variables: context, text } = props
    // Temporal custom fields render in the contact's timezone, falling back to
    // the workspace timezone (then UTC) — an outgoing message should read in the
    // recipient's local time when we know it. See getContactTimezone.
    const renderTimezone = getContactTimezone(context)

    try {
      const mapping: Record<string, string> = {}
      const variables = extractVariables(text)
      for (const variable of variables) {
        const resolver = variableResolvers.find((candidate) =>
          candidate.matches(variable, context),
        )
        if (resolver) {
          mapping[variable] = await resolver.resolve(
            variable,
            context,
            renderTimezone,
          )
        }
      }

      // Prose: "Anh vui lòng…" opening a sentence, "Xin chào anh" inside one.
      return interpolate(text, mapping, { sentenceCase: true })
    } catch (error) {
      const message = "Unable to render custom fields to message"
      logger.error(error, message)

      throw new Error(message)
    }
  },
}
