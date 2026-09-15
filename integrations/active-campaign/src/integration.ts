import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { activeCampaignRequest } from "./client"
import {
  activeCampaignAccountsPath,
  activeCampaignAutomationsPath,
  activeCampaignContactAutomationsForContactPath,
  activeCampaignContactAutomationsPath,
  activeCampaignContactListsPath,
  activeCampaignContactSyncPath,
  activeCampaignContactTagsPath,
  activeCampaignFieldsPath,
  activeCampaignListsPath,
  activeCampaignTagsPath,
} from "./constants"
import { ActiveCampaignApiError } from "./error"
import {
  type ActiveCampaignActions,
  type ActiveCampaignAuthValue,
  type ActiveCampaignConfig,
  type ActiveCampaignContactAutomationPayload,
  activeCampaignAccountsResponseSchema,
  activeCampaignAutomationsResponseSchema,
  activeCampaignContactAutomationPayloadSchema,
  activeCampaignContactAutomationsResponseSchema,
  activeCampaignContactListPayloadSchema,
  activeCampaignContactPayloadSchema,
  activeCampaignContactSyncResponseSchema,
  activeCampaignContactTagPayloadSchema,
  activeCampaignCredentialSchema,
  activeCampaignEmptyResponseSchema,
  activeCampaignFieldsResponseSchema,
  activeCampaignListsResponseSchema,
  activeCampaignTagsResponseSchema,
  createActiveCampaignAuth,
} from "./schemas"

const SUBSCRIBER_SERIES_ERROR_MESSAGE = "Could not create SubscriberSeries"

const isSubscriberSeriesConflict = (error: unknown) =>
  error instanceof ActiveCampaignApiError &&
  error.statusCode === 422 &&
  error.message.includes(SUBSCRIBER_SERIES_ERROR_MESSAGE)

const contactAutomationMatches = (
  contactAutomation: { automation?: string; seriesid?: string },
  automationId: string,
) =>
  contactAutomation.automation === automationId ||
  contactAutomation.seriesid === automationId

const contactAutomationExists = async (
  auth: ActiveCampaignAuthValue,
  payload: ActiveCampaignContactAutomationPayload,
) => {
  const response = await activeCampaignRequest(
    auth,
    activeCampaignContactAutomationsForContactPath(payload.contactId),
    activeCampaignContactAutomationsResponseSchema,
  )

  return response.contactAutomations.some((contactAutomation) =>
    contactAutomationMatches(contactAutomation, payload.automationId),
  )
}

const config: IntegrationDefinition<
  ActiveCampaignConfig,
  ActiveCampaignAuthValue,
  ActiveCampaignActions
> = {
  name: "activeCampaign",
  connection: {
    kind: "integration",
    strategy: "api_key",
    multiAccount: false,
    configFields: [
      {
        name: "apiUrl",
        type: "url",
        required: true,
        labelKey: "integrations.activeCampaign.fields.apiUrl",
      },
      {
        name: "apiKey",
        type: "secret",
        required: true,
        labelKey: "integrations.activeCampaign.fields.apiKey",
      },
    ],
    describe: () => ({
      // ActiveCampaign auth has no stable account id; this is workspace-singleton.
      sourceId: "workspace",
      displayName: "ActiveCampaign",
    }),
    verify: async ({ auth }) => {
      try {
        await activeCampaignRequest(
          auth,
          activeCampaignAccountsPath(),
          activeCampaignAccountsResponseSchema,
        )
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          revoked: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to verify ActiveCampaign credentials",
        }
      }
    },
    // TODO(connection-phase2): refine once ActiveCampaign revoked-token error shape is confirmed.
    isRevokedTokenError: () => false,
  },
  actions: {
    validateCredentials: async ({ props }) => {
      const credential = activeCampaignCredentialSchema.parse(props)
      await activeCampaignRequest(
        credential,
        activeCampaignAccountsPath(),
        activeCampaignAccountsResponseSchema,
      )
      return createActiveCampaignAuth(credential)
    },
    listLists: async ({ ctx }) => {
      const response = await activeCampaignRequest(
        ctx.auth,
        activeCampaignListsPath(),
        activeCampaignListsResponseSchema,
      )
      return response.lists
    },
    listAutomations: async ({ ctx }) => {
      const response = await activeCampaignRequest(
        ctx.auth,
        activeCampaignAutomationsPath(),
        activeCampaignAutomationsResponseSchema,
      )
      return response.automations
    },
    listTags: async ({ ctx }) => {
      const response = await activeCampaignRequest(
        ctx.auth,
        activeCampaignTagsPath(),
        activeCampaignTagsResponseSchema,
      )
      return response.tags
    },
    listCustomFields: async ({ ctx }) => {
      const response = await activeCampaignRequest(
        ctx.auth,
        activeCampaignFieldsPath(),
        activeCampaignFieldsResponseSchema,
      )
      return response.fields
    },
    syncContact: async ({ ctx, props }) => {
      const contact = activeCampaignContactPayloadSchema.parse(props)
      const response = await activeCampaignRequest(
        ctx.auth,
        activeCampaignContactSyncPath(),
        activeCampaignContactSyncResponseSchema,
        {
          method: "post",
          json: {
            contact: {
              email: contact.email,
              ...(contact.firstName ? { firstName: contact.firstName } : {}),
              ...(contact.lastName ? { lastName: contact.lastName } : {}),
              ...(contact.phone ? { phone: contact.phone } : {}),
              ...(contact.fieldValues.length
                ? {
                    fieldValues: contact.fieldValues.map((fieldValue) => ({
                      field: fieldValue.fieldId,
                      value: fieldValue.value,
                    })),
                  }
                : {}),
            },
          },
        },
      )
      return response.contact
    },
    addContactToList: async ({ ctx, props }) => {
      const payload = activeCampaignContactListPayloadSchema.parse(props)
      await activeCampaignRequest(
        ctx.auth,
        activeCampaignContactListsPath(),
        activeCampaignEmptyResponseSchema,
        {
          method: "post",
          json: {
            contactList: {
              contact: payload.contactId,
              list: payload.listId,
              status: payload.status,
            },
          },
        },
      )
    },
    addContactToAutomation: async ({ ctx, props }) => {
      const payload = activeCampaignContactAutomationPayloadSchema.parse(props)

      if (await contactAutomationExists(ctx.auth, payload)) {
        return
      }

      try {
        await activeCampaignRequest(
          ctx.auth,
          activeCampaignContactAutomationsPath(),
          activeCampaignEmptyResponseSchema,
          {
            method: "post",
            json: {
              contactAutomation: {
                contact: payload.contactId,
                automation: payload.automationId,
              },
            },
          },
        )
      } catch (error) {
        if (isSubscriberSeriesConflict(error)) {
          return
        }

        throw error
      }
    },
    addTagToContact: async ({ ctx, props }) => {
      const payload = activeCampaignContactTagPayloadSchema.parse(props)
      await activeCampaignRequest(
        ctx.auth,
        activeCampaignContactTagsPath(),
        activeCampaignEmptyResponseSchema,
        {
          method: "post",
          json: {
            contactTag: {
              contact: payload.contactId,
              tag: payload.tagId,
            },
          },
        },
      )
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(
      new SdkException("ActiveCampaign does not expose request handlers"),
    ),
}

export const integration = new Integration(config)
