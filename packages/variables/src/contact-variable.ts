import { workspaceService } from "@chatbotx.io/business"
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
import { isCouponVariable, resolveCouponVariable } from "./coupon-variable"
import { logger } from "./logger"
import type { ContactCustomFieldValue, ReplaceVariableProps } from "./schema"
import {
  extractVariables,
  getContactTimezone,
  getSystemFieldValue,
  interpolate,
  renderCustomFieldValue,
} from "./utils"

const RAW_CUSTOM_FIELD_VARIABLE_PREFIX = "raw:"

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

// Match custom-field names exactly (no trimming): the map is keyed by the raw
// `customField.name`, and the token is built from that same name, so any
// normalisation here would break names with meaningful surrounding whitespace.
const toRawCustomFieldName = (variable: string): string =>
  variable.slice(RAW_CUSTOM_FIELD_VARIABLE_PREFIX.length)

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

const couponResolver: VariableResolver = {
  matches: (variable) => isCouponVariable(variable),
  resolve: async (variable, context) =>
    await resolveCouponVariable(context, variable),
}

const variableResolvers = [
  systemFieldResolver,
  rawCustomFieldResolver,
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

export const contactVariableService = {
  getAll: async (input: GetAllProps): Promise<ReplaceVariableProps> => {
    const [contact, contactInbox, customFieldsMap] = await Promise.all([
      loadContact(input.contactId),
      loadInbox(input.contactInbox),
      loadFields(input.contactId),
    ])
    const workspace = await loadWorkspace({
      contact,
      workspace: input.workspace,
    })

    return {
      contact,
      contactInbox,
      conversation: input.conversation ?? null,
      appointmentId: input.appointmentId,
      customFieldsMap,
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
