import {
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { moosendRequest } from "./client"
import { moosendListsPagePath, moosendSubscribePath } from "./constants"
import {
  createMoosendAuth,
  type MoosendActions,
  type MoosendAuthValue,
  type MoosendConfig,
  moosendContactPayloadSchema,
  moosendListPageRequestSchema,
  moosendMailingListsResponseSchema,
  moosendSubscriberResponseSchema,
} from "./schemas"

/** Shared by `connection.fromCredentials` (live-validate + return `AuthValue`) and the legacy `validateCredentials` action. */
const buildMoosendAuth = async (apiKey: string): Promise<MoosendAuthValue> => {
  const auth = createMoosendAuth(apiKey)
  await moosendRequest(
    auth,
    moosendListsPagePath(1, 1),
    moosendMailingListsResponseSchema,
  )
  return auth
}

const config: IntegrationDefinition<
  MoosendConfig,
  MoosendAuthValue,
  MoosendActions
> = {
  name: "moosend",
  connection: {
    kind: "integration",
    strategy: "api_key",
    multiAccount: false,
    configFields: [
      {
        name: "apiKey",
        type: "secret",
        required: true,
        labelKey: "integrations.moosend.fields.apiKey",
      },
    ],
    describe: () => ({
      // Moosend auth contains no stable account identifier; this is workspace-scoped.
      sourceId: "workspace",
      displayName: "Moosend",
    }),
    fromCredentials: (config: { apiKey: string }) =>
      buildMoosendAuth(config.apiKey),
    verify: async ({ auth }) => {
      try {
        await moosendRequest(
          auth,
          moosendListsPagePath(1, 1),
          moosendMailingListsResponseSchema,
        )
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          revoked:
            typeof error === "object" &&
            error !== null &&
            "kind" in error &&
            error.kind === "invalid_credentials",
          error:
            error instanceof Error
              ? error.message
              : "Moosend credential verification failed",
        }
      }
    },
    isRevokedTokenError: (error) =>
      typeof error === "object" &&
      error !== null &&
      "kind" in error &&
      error.kind === "invalid_credentials",
  },
  actions: {
    validateCredentials: async ({ props }) => buildMoosendAuth(props.apiKey),
    listMailingLists: async ({ ctx, props }) => {
      const page = moosendListPageRequestSchema.parse(props)
      const response = await moosendRequest(
        ctx.auth,
        moosendListsPagePath(page.page, page.pageSize),
        moosendMailingListsResponseSchema,
      )
      return {
        data: response.Context.MailingLists.map((list) => ({
          id: list.ID,
          name: list.Name,
        })),
        meta: {
          pageSize: response.Context.Paging.PageSize,
          currentPage: response.Context.Paging.CurrentPage,
          totalResults: response.Context.Paging.TotalResults,
          totalPageCount: response.Context.Paging.TotalPageCount,
        },
      }
    },
    createOrUpdateContact: async ({ ctx, props }) => {
      const parsed = moosendContactPayloadSchema.parse(props)
      const response = await moosendRequest(
        ctx.auth,
        moosendSubscribePath(parsed.listId),
        moosendSubscriberResponseSchema,
        {
          method: "post",
          json: { Email: parsed.email },
        },
      )
      return {
        id: response.Context.ID,
        email: response.Context.Email,
        subscribeType: response.Context.SubscribeType,
      }
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(
      new SdkException("Moosend does not expose request handlers"),
    ),
}

export const integration = new Integration(config)
