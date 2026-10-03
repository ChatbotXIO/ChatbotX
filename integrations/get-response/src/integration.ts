import {
  apiKeyConnection,
  Integration,
  type IntegrationDefinition,
  isUnauthorizedStatusError,
  SdkException,
} from "@chatbotx.io/sdk"
import { getResponseRequest } from "./client"
import {
  GET_RESPONSE_ACCOUNTS_PATH,
  GET_RESPONSE_CAMPAIGNS_PATH,
  GET_RESPONSE_CONTACTS_PATH,
  GET_RESPONSE_TAGS_PATH,
} from "./constants"
import { GetResponseApiError } from "./error"
import {
  createGetResponseAuth,
  type GetResponseActions,
  type GetResponseAuthValue,
  type GetResponseConfig,
  getResponseAccountsResponseSchema,
  getResponseCampaignsResponseSchema,
  getResponseContactPayloadSchema,
  getResponseContactResponseSchema,
  getResponseTagsResponseSchema,
} from "./schemas"

const pageSearchParams = (props: { page: number; perPage: number }) =>
  new URLSearchParams({
    page: String(props.page),
    perPage: String(props.perPage),
  })

const mapPageMeta = (props: {
  currentPage: number
  perPage: number
  total: number
}) => ({
  currentPage: props.currentPage,
  lastPage: Math.max(1, Math.ceil(props.total / props.perPage)),
  perPage: props.perPage,
  total: props.total,
})

const getResponseFields = [
  {
    name: "apiKey",
    type: "secret",
    required: true,
    labelKey: "integrations.getResponse.fields.apiKey",
  },
] as const

const buildGetResponseAuth = async (config: {
  apiKey: string
}): Promise<GetResponseAuthValue> => createGetResponseAuth(config.apiKey)

const probeGetResponse = async (auth: GetResponseAuthValue) => {
  await getResponseRequest(
    auth,
    GET_RESPONSE_ACCOUNTS_PATH,
    getResponseAccountsResponseSchema,
    undefined,
    [200],
  )
}

const config: IntegrationDefinition<
  GetResponseConfig,
  GetResponseAuthValue,
  GetResponseActions
> = {
  name: "getResponse",
  connection: apiKeyConnection({
    displayName: "GetResponse",
    fields: getResponseFields,
    buildAuth: buildGetResponseAuth,
    probe: probeGetResponse,
    isRevoked: isUnauthorizedStatusError,
  }),
  actions: {
    validateCredentials: async ({ props }) => {
      const auth = await buildGetResponseAuth(props)
      await probeGetResponse(auth)
      return auth
    },
    listCampaigns: async ({ ctx, props }) => {
      const response = await getResponseRequest(
        ctx.auth,
        GET_RESPONSE_CAMPAIGNS_PATH,
        getResponseCampaignsResponseSchema,
        { searchParams: pageSearchParams(props) },
        [200],
      )
      return {
        data: response.data,
        meta: mapPageMeta({
          currentPage: props.page,
          perPage: props.perPage,
          total: response.totalCount,
        }),
      }
    },
    listTags: async ({ ctx, props }) => {
      const response = await getResponseRequest(
        ctx.auth,
        GET_RESPONSE_TAGS_PATH,
        getResponseTagsResponseSchema,
        { searchParams: pageSearchParams(props) },
        [200],
      )
      return {
        data: response.data,
        meta: mapPageMeta({
          currentPage: props.page,
          perPage: props.perPage,
          total: response.totalCount,
        }),
      }
    },
    createOrUpdateContact: async ({ ctx, props }) => {
      const parsed = getResponseContactPayloadSchema.parse(props)
      const payload = {
        email: parsed.email,
        campaign: parsed.campaign,
        ...(parsed.name && parsed.name.length >= 3
          ? { name: parsed.name }
          : {}),
        ...(parsed.tags?.length ? { tags: parsed.tags } : {}),
        ...(parsed.dayOfCycle === undefined
          ? {}
          : { dayOfCycle: parsed.dayOfCycle }),
      }
      try {
        await getResponseRequest(
          ctx.auth,
          GET_RESPONSE_CONTACTS_PATH,
          getResponseContactResponseSchema,
          { method: "post", json: payload },
          [202],
        )
      } catch (e) {
        if (e instanceof GetResponseApiError && e.statusCode === 409) {
          // Contact is blacklisted or unsubscribed — cannot be updated
          return
        }
        throw e
      }
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(
      new SdkException("GetResponse does not expose request handlers"),
    ),
}

export const integration = new Integration(config)
