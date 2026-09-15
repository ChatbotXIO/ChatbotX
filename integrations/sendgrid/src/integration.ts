import {
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

/** Shared by `connection.fromCredentials` (live-validate + return `AuthValue`) and the legacy `validateCredentials` action. */
const buildSendGridAuth = async (
  apiKey: string,
): Promise<SendGridAuthValue> => {
  const auth = createSendGridAuth(apiKey)
  const { scopes } = await sendGridRequest(
    auth,
    SENDGRID_SCOPES_PATH,
    sendGridScopesResponseSchema,
  )
  // SendGrid API keys can report Marketing permissions under either the
  // modern "marketing.*" scope names or the legacy "marketing_campaigns.*"
  // names depending on key type. Full Access keys have implicit write
  // access but do NOT enumerate "marketing.write" in the scopes endpoint
  // even though write calls succeed (HTTP 202). Checking read is enough.
  const hasRead =
    scopes.includes("marketing.read") ||
    scopes.includes("marketing_campaigns.read")
  if (!hasRead) {
    throw new SendGridMissingScopesError(["marketing.read"])
  }
  return auth
}

const config: IntegrationDefinition<
  SendGridConfig,
  SendGridAuthValue,
  SendGridActions
> = {
  name: "sendGrid",
  connection: {
    kind: "integration",
    strategy: "api_key",
    multiAccount: false,
    configFields: [
      {
        name: "apiKey",
        type: "secret",
        required: true,
        labelKey: "integrations.sendGrid.fields.apiKey",
      },
    ],
    describe: () => ({
      // SendGrid auth contains no stable account identifier; this is workspace-scoped.
      sourceId: "workspace",
      displayName: "SendGrid",
    }),
    fromCredentials: (config: { apiKey: string }) =>
      buildSendGridAuth(config.apiKey),
    verify: async ({ auth }) => {
      try {
        await sendGridRequest(
          auth,
          SENDGRID_SCOPES_PATH,
          sendGridScopesResponseSchema,
        )
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          revoked: isUnauthorizedStatusError(error),
          error:
            error instanceof Error
              ? error.message
              : "SendGrid credential verification failed",
        }
      }
    },
    isRevokedTokenError: isUnauthorizedStatusError,
  },
  actions: {
    validateCredentials: async ({ props }) => buildSendGridAuth(props.apiKey),
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
