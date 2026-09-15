import {
  Integration,
  type IntegrationDefinition,
  isUnauthorizedStatusError,
  SdkException,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import {
  createMailchimpAuth,
  getSubscriberHash,
  mailchimpRequest,
} from "./client"
import {
  MAILCHIMP_DEFAULT_PAGE_SIZE,
  MAILCHIMP_PING_ENDPOINT,
} from "./constants"
import {
  type MailchimpActions,
  type MailchimpAuthValue,
  type MailchimpConfig,
  mailchimpAudiencesResponseSchema,
  mailchimpMemberSchema,
  mailchimpMergeFieldsResponseSchema,
  mailchimpPingResponseSchema,
  mailchimpTagsResponseSchema,
} from "./schemas"

/** Shared by `connection.fromCredentials` (live-validate + return `AuthValue`) and the legacy `validateApiKey` action. */
const buildMailchimpAuth = async (
  apiKey: string,
): Promise<MailchimpAuthValue> => {
  const auth = createMailchimpAuth(apiKey)
  await mailchimpRequest(
    auth,
    MAILCHIMP_PING_ENDPOINT,
    mailchimpPingResponseSchema,
  )
  return auth
}

const config: IntegrationDefinition<
  MailchimpConfig,
  MailchimpAuthValue,
  MailchimpActions
> = {
  name: "mailchimp",
  connection: {
    kind: "integration",
    strategy: "api_key",
    multiAccount: false,
    configFields: [
      {
        name: "apiKey",
        type: "secret",
        required: true,
        labelKey: "integrations.mailchimp.fields.apiKey",
      },
    ],
    describe: () => ({
      // Mailchimp auth contains no stable account identifier; this is workspace-scoped.
      sourceId: "workspace",
      displayName: "Mailchimp",
    }),
    fromCredentials: (config: { apiKey: string }) =>
      buildMailchimpAuth(config.apiKey),
    verify: async ({ auth }) => {
      try {
        await mailchimpRequest(
          auth,
          MAILCHIMP_PING_ENDPOINT,
          mailchimpPingResponseSchema,
        )
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          revoked: isUnauthorizedStatusError(error),
          error:
            error instanceof Error
              ? error.message
              : "Mailchimp credential verification failed",
        }
      }
    },
    isRevokedTokenError: isUnauthorizedStatusError,
  },
  actions: {
    validateApiKey: async ({ props }) => {
      const auth = await buildMailchimpAuth(props.apiKey)
      return { dataCenter: auth.dataCenter }
    },
    listAudiences: async ({ ctx }) => {
      const response = await mailchimpRequest(
        ctx.auth,
        `lists?count=${MAILCHIMP_DEFAULT_PAGE_SIZE}&offset=0`,
        mailchimpAudiencesResponseSchema,
      )
      return response.lists
    },
    listTags: async ({ ctx, props }) => {
      const response = await mailchimpRequest(
        ctx.auth,
        `lists/${props.listId}/tag-search?count=${MAILCHIMP_DEFAULT_PAGE_SIZE}`,
        mailchimpTagsResponseSchema,
      )
      return response.tags
    },
    listMergeFields: async ({ ctx, props }) => {
      const response = await mailchimpRequest(
        ctx.auth,
        `lists/${props.listId}/merge-fields?count=${MAILCHIMP_DEFAULT_PAGE_SIZE}`,
        mailchimpMergeFieldsResponseSchema,
      )
      return response.merge_fields
    },
    addMember: async ({ ctx, props }) => {
      const subscriberHash = getSubscriberHash(props.email)
      const status = props.doubleOptIn ? "pending" : "subscribed"
      const member = await mailchimpRequest(
        ctx.auth,
        `lists/${props.listId}/members/${subscriberHash}`,
        mailchimpMemberSchema,
        {
          method: "put",
          json: {
            email_address: props.email,
            status_if_new: status,
            status,
            merge_fields: props.mergeFields,
          },
        },
      )
      if (props.tags.length > 0) {
        await mailchimpRequest(
          ctx.auth,
          `lists/${props.listId}/members/${subscriberHash}/tags`,
          z.unknown(),
          {
            method: "post",
            json: {
              tags: props.tags.map((name) => ({ name, status: "active" })),
            },
          },
        )
      }
      return member
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(
      new SdkException("Mailchimp does not expose request handlers"),
    ),
}

export const integration = new Integration(config)
