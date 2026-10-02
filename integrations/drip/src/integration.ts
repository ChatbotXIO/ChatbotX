import {
  Integration,
  type IntegrationDefinition,
  isUnauthorizedStatusError,
  SdkException,
} from "@chatbotx.io/sdk"
import { dripRequest } from "./client"
import {
  DRIP_ACCOUNTS_PATH,
  dripCustomFieldIdentifiersPath,
  dripSubscribersPath,
  dripTagsPath,
} from "./constants"
import { DripNoAccountError } from "./error"
import {
  createDripAuth,
  type DripActions,
  type DripAuthValue,
  type DripConfig,
  dripAccountsResponseSchema,
  dripCustomFieldIdentifiersResponseSchema,
  dripSubscriberPayloadSchema,
  dripSubscriberResponseSchema,
  dripTagsResponseSchema,
} from "./schemas"

/** Shared by `connection.fromCredentials` (live-validate + return `AuthValue`) and the legacy `validateCredentials` action. */
const buildDripAuth = async (apiToken: string): Promise<DripAuthValue> => {
  const auth = createDripAuth(apiToken)
  const response = await dripRequest(
    auth,
    DRIP_ACCOUNTS_PATH,
    dripAccountsResponseSchema,
  )
  if (response.accounts.length === 0) {
    throw new DripNoAccountError()
  }
  return auth
}

const config: IntegrationDefinition<DripConfig, DripAuthValue, DripActions> = {
  name: "drip",
  connection: {
    kind: "integration",
    strategy: "api_key",
    multiAccount: false,
    configFields: [
      {
        name: "apiToken",
        type: "secret",
        required: true,
        labelKey: "integrations.drip.fields.apiToken",
      },
    ],
    describe: () => ({
      // Drip auth has no stable account id; this is workspace-singleton.
      sourceId: "workspace",
      displayName: "Drip",
    }),
    fromCredentials: (config: { apiToken: string }) =>
      buildDripAuth(config.apiToken),
    verify: async ({ auth }) => {
      try {
        const response = await dripRequest(
          auth,
          DRIP_ACCOUNTS_PATH,
          dripAccountsResponseSchema,
        )
        if (response.accounts.length === 0) {
          throw new DripNoAccountError()
        }
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          revoked: isUnauthorizedStatusError(error),
          error:
            error instanceof Error
              ? error.message
              : "Unable to verify Drip credentials",
        }
      }
    },
    isRevokedTokenError: isUnauthorizedStatusError,
  },
  actions: {
    validateCredentials: async ({ props }) => buildDripAuth(props.apiToken),
    listAccounts: async ({ ctx }) => {
      const response = await dripRequest(
        ctx.auth,
        DRIP_ACCOUNTS_PATH,
        dripAccountsResponseSchema,
      )
      return response.accounts
    },
    listTags: async ({ ctx, props }) => {
      const response = await dripRequest(
        ctx.auth,
        dripTagsPath(props.accountId),
        dripTagsResponseSchema,
      )
      return response.tags
    },
    listCustomFields: async ({ ctx, props }) => {
      const response = await dripRequest(
        ctx.auth,
        dripCustomFieldIdentifiersPath(props.accountId),
        dripCustomFieldIdentifiersResponseSchema,
      )
      return response.custom_field_identifiers.map((identifier) => ({
        identifier,
        label: identifier,
      }))
    },
    syncSubscriber: async ({ ctx, props }) => {
      const payload = dripSubscriberPayloadSchema.parse(props)
      const body = {
        subscribers: [
          {
            email: payload.email,
            ...(payload.first_name ? { first_name: payload.first_name } : {}),
            ...(payload.last_name ? { last_name: payload.last_name } : {}),
            ...(payload.phone ? { phone: payload.phone } : {}),
            ...(payload.tags?.length ? { tags: payload.tags } : {}),
            ...(payload.custom_fields &&
            Object.keys(payload.custom_fields).length > 0
              ? { custom_fields: payload.custom_fields }
              : {}),
          },
        ],
      }
      await dripRequest(
        ctx.auth,
        dripSubscribersPath(props.accountId),
        dripSubscriberResponseSchema,
        { method: "post", json: body },
      )
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(new SdkException("Drip does not expose request handlers")),
}

export const integration = new Integration(config)
