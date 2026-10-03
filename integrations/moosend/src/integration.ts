import {
  apiKeyConnection,
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

const moosendFields = [
  {
    name: "apiKey",
    type: "secret",
    required: true,
    labelKey: "integrations.moosend.fields.apiKey",
  },
] as const

const buildMoosendAuth = async (config: {
  apiKey: string
}): Promise<MoosendAuthValue> => createMoosendAuth(config.apiKey)

const probeMoosend = async (auth: MoosendAuthValue) => {
  await moosendRequest(
    auth,
    moosendListsPagePath(1, 1),
    moosendMailingListsResponseSchema,
  )
}

const isRevokedTokenError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "kind" in error &&
  error.kind === "invalid_credentials"

const connection = apiKeyConnection({
  displayName: "Moosend",
  fields: moosendFields,
  buildAuth: buildMoosendAuth,
  probe: probeMoosend,
  isRevoked: isRevokedTokenError,
})

const config: IntegrationDefinition<
  MoosendConfig,
  MoosendAuthValue,
  MoosendActions
> = {
  name: "moosend",
  connection,
  actions: {
    validateCredentials: ({ props }) => connection.fromCredentials(props),
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
