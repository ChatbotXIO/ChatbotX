import {
  Integration,
  type IntegrationDefinition,
  isUnauthorizedStatusError,
  SdkException,
} from "@chatbotx.io/sdk"
import { mailerLiteRequest } from "./client"
import {
  MAILER_LITE_FIELDS_PATH,
  MAILER_LITE_GROUPS_PATH,
  MAILER_LITE_SUBSCRIBERS_PATH,
} from "./constants"
import {
  createMailerLiteAuth,
  type MailerLiteActions,
  type MailerLiteAuthValue,
  type MailerLiteConfig,
  mailerLiteFieldsResponseSchema,
  mailerLiteGroupsResponseSchema,
  mailerLiteSubscriberPayloadSchema,
  mailerLiteSubscriberResponseSchema,
} from "./schemas"

const mapPageMeta = (meta: {
  current_page: number
  last_page: number
  per_page: number
  total: number
}) => ({
  currentPage: meta.current_page,
  lastPage: meta.last_page,
  perPage: meta.per_page,
  total: meta.total,
})

const pageSearchParams = (props: { page: number; limit: number }) =>
  new URLSearchParams({
    page: String(props.page),
    limit: String(props.limit),
  })

/** Shared by `connection.fromCredentials` (live-validate + return `AuthValue`) and the legacy `validateCredentials` action. */
const buildMailerLiteAuth = async (
  apiKey: string,
): Promise<MailerLiteAuthValue> => {
  const auth = createMailerLiteAuth(apiKey)
  await mailerLiteRequest(
    auth,
    MAILER_LITE_GROUPS_PATH,
    mailerLiteGroupsResponseSchema,
    { searchParams: pageSearchParams({ page: 1, limit: 1 }) },
    [200],
  )
  return auth
}

const config: IntegrationDefinition<
  MailerLiteConfig,
  MailerLiteAuthValue,
  MailerLiteActions
> = {
  name: "mailerLite",
  connection: {
    kind: "integration",
    strategy: "api_key",
    multiAccount: false,
    configFields: [
      {
        name: "apiKey",
        type: "secret",
        required: true,
        labelKey: "integrations.mailerLite.fields.apiKey",
      },
    ],
    describe: () => ({
      // MailerLite auth contains no stable account identifier; this is workspace-scoped.
      sourceId: "workspace",
      displayName: "MailerLite",
    }),
    fromCredentials: (config: { apiKey: string }) =>
      buildMailerLiteAuth(config.apiKey),
    verify: async ({ auth }) => {
      try {
        await mailerLiteRequest(
          auth,
          MAILER_LITE_GROUPS_PATH,
          mailerLiteGroupsResponseSchema,
          { searchParams: pageSearchParams({ page: 1, limit: 1 }) },
          [200],
        )
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          revoked: isUnauthorizedStatusError(error),
          error:
            error instanceof Error
              ? error.message
              : "MailerLite credential verification failed",
        }
      }
    },
    isRevokedTokenError: isUnauthorizedStatusError,
  },
  actions: {
    validateCredentials: async ({ props }) => buildMailerLiteAuth(props.apiKey),
    listGroups: async ({ ctx, props }) => {
      const response = await mailerLiteRequest(
        ctx.auth,
        MAILER_LITE_GROUPS_PATH,
        mailerLiteGroupsResponseSchema,
        { searchParams: pageSearchParams(props) },
        [200],
      )
      return { data: response.data, meta: mapPageMeta(response.meta) }
    },
    listFields: async ({ ctx, props }) => {
      const response = await mailerLiteRequest(
        ctx.auth,
        MAILER_LITE_FIELDS_PATH,
        mailerLiteFieldsResponseSchema,
        { searchParams: pageSearchParams(props) },
        [200],
      )
      return { data: response.data, meta: mapPageMeta(response.meta) }
    },
    createOrUpdateSubscriber: async ({ ctx, props }) => {
      const parsed = mailerLiteSubscriberPayloadSchema.parse(props)
      const payload = {
        email: parsed.email,
        status: parsed.status,
        ...(parsed.fields ? { fields: parsed.fields } : {}),
        ...(parsed.groups ? { groups: parsed.groups } : {}),
      }
      return await mailerLiteRequest(
        ctx.auth,
        MAILER_LITE_SUBSCRIBERS_PATH,
        mailerLiteSubscriberResponseSchema,
        { method: "post", json: payload },
        [200, 201],
      )
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(
      new SdkException("MailerLite does not expose request handlers"),
    ),
}

export const integration = new Integration(config)
