import {
  apiKeyConnection,
  Integration,
  type IntegrationDefinition,
  isUnauthorizedStatusError,
  SdkException,
} from "@chatbotx.io/sdk"
import { sendGridRequest } from "./client"
import {
  SENDGRID_API_BASE_URL,
  SENDGRID_CONTACTS_IMPORTS_PATH,
  SENDGRID_CONTACTS_PATH,
  SENDGRID_FIELD_DEFINITIONS_PATH,
  SENDGRID_LISTS_PATH,
  SENDGRID_SCOPES_PATH,
} from "./constants"
import { SendGridMissingScopesError } from "./error"
import {
  createSendGridAuth,
  type SendGridActions,
  type SendGridAuthValue,
  type SendGridConfig,
  sendGridAcceptedResponseSchema,
  sendGridContactPayloadSchema,
  sendGridFieldDefinitionsResponseSchema,
  sendGridImportJobSchema,
  sendGridListsResponseSchema,
  sendGridScopesResponseSchema,
} from "./schemas"

const getNextPageToken = (next?: string) => {
  if (!next) {
    return
  }
  const url = new URL(next)
  if (url.origin !== new URL(SENDGRID_API_BASE_URL).origin) {
    return
  }
  return url.searchParams.get("page_token")?.trim() || undefined
}

const sendGridFields = [
  {
    name: "apiKey",
    type: "secret",
    required: true,
  },
] as const

const buildSendGridAuth = async (config: {
  apiKey: string
}): Promise<SendGridAuthValue> => createSendGridAuth(config.apiKey)

const probeSendGrid = async (auth: SendGridAuthValue) => {
  const { scopes } = await sendGridRequest(
    auth,
    SENDGRID_SCOPES_PATH,
    sendGridScopesResponseSchema,
  )
  const hasRead =
    scopes.includes("marketing.read") ||
    scopes.includes("marketing_campaigns.read")
  if (!hasRead) {
    throw new SendGridMissingScopesError(["marketing.read"])
  }
}

const connection = apiKeyConnection({
  displayName: "SendGrid",
  fields: sendGridFields,
  buildAuth: buildSendGridAuth,
  probe: probeSendGrid,
  isRevoked: isUnauthorizedStatusError,
})

const config: IntegrationDefinition<
  SendGridConfig,
  SendGridAuthValue,
  SendGridActions
> = {
  name: "sendGrid",
  connection,
  actions: {
    validateCredentials: ({ props }) => connection.fromCredentials(props),
    listLists: async ({ ctx, props }) => {
      const searchParams = new URLSearchParams({
        page_size: String(props.pageSize),
      })
      if (props.pageToken) {
        searchParams.set("page_token", props.pageToken)
      }
      const response = await sendGridRequest(
        ctx.auth,
        SENDGRID_LISTS_PATH,
        sendGridListsResponseSchema,
        { searchParams },
      )
      return {
        data: response.result.map((item) => ({
          id: item.id,
          name: item.name,
          contactCount: item.contact_count,
        })),
        nextPageToken: getNextPageToken(response._metadata?.next),
        count: response._metadata?.count,
      }
    },
    listCustomFields: async ({ ctx }) => {
      const response = await sendGridRequest(
        ctx.auth,
        SENDGRID_FIELD_DEFINITIONS_PATH,
        sendGridFieldDefinitionsResponseSchema,
      )
      return response.custom_fields.map((field) => ({
        id: field.id,
        name: field.name,
        fieldType: field.field_type,
      }))
    },
    addOrUpdateContact: async ({ ctx, props }) => {
      const payload = sendGridContactPayloadSchema.parse(props)
      return await sendGridRequest(
        ctx.auth,
        SENDGRID_CONTACTS_PATH,
        sendGridAcceptedResponseSchema,
        { method: "put", json: payload },
      )
    },
    checkImportJob: ({ ctx, props }) =>
      sendGridRequest(
        ctx.auth,
        `${SENDGRID_CONTACTS_IMPORTS_PATH}/${props.jobId}`,
        sendGridImportJobSchema,
      ),
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(
      new SdkException("SendGrid does not expose request handlers"),
    ),
}

export const integration = new Integration(config)
