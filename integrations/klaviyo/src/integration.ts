import {
  Integration,
  type IntegrationDefinition,
  isUnauthorizedStatusError,
  SdkException,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { klaviyoRequest } from "./client"
import {
  KLAVIYO_LISTS_PATH,
  KLAVIYO_PROFILE_IMPORT_PATH,
  klaviyoListProfilesPath,
} from "./constants"
import {
  createKlaviyoAuth,
  type KlaviyoActions,
  type KlaviyoAuthValue,
  type KlaviyoConfig,
  klaviyoListPageInputSchema,
  klaviyoListsResponseSchema,
  klaviyoProfileImportResponseSchema,
  klaviyoSyncProfilePropsSchema,
} from "./schemas"

const noContentResponseSchema = z.undefined()

const pageSearchParams = (props: { cursor?: string; size: number }) => {
  const searchParams = new URLSearchParams({ "page[size]": String(props.size) })
  if (props.cursor) {
    searchParams.set("page[cursor]", props.cursor)
  }
  return searchParams
}

const extractNextCursor = (next: string | null | undefined) =>
  next ? new URL(next).searchParams.get("page[cursor]") : null

/** Shared by `connection.fromCredentials` (live-validate + return `AuthValue`) and the legacy `validateCredentials` action. */
const buildKlaviyoAuth = async (apiKey: string): Promise<KlaviyoAuthValue> => {
  const auth = createKlaviyoAuth(apiKey)
  await klaviyoRequest(
    auth,
    KLAVIYO_LISTS_PATH,
    klaviyoListsResponseSchema,
    { searchParams: pageSearchParams({ size: 1 }) },
    [200],
  )
  return auth
}

const config: IntegrationDefinition<
  KlaviyoConfig,
  KlaviyoAuthValue,
  KlaviyoActions
> = {
  name: "klaviyo",
  connection: {
    kind: "integration",
    strategy: "api_key",
    multiAccount: false,
    configFields: [
      {
        name: "apiKey",
        type: "secret",
        required: true,
        labelKey: "integrations.klaviyo.fields.apiKey",
      },
    ],
    describe: () => ({
      // Klaviyo auth contains no stable account identifier; this is workspace-scoped.
      sourceId: "workspace",
      displayName: "Klaviyo",
    }),
    fromCredentials: (config: { apiKey: string }) =>
      buildKlaviyoAuth(config.apiKey),
    verify: async ({ auth }) => {
      try {
        await klaviyoRequest(
          auth,
          KLAVIYO_LISTS_PATH,
          klaviyoListsResponseSchema,
          { searchParams: pageSearchParams({ size: 1 }) },
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
              : "Klaviyo credential verification failed",
        }
      }
    },
    isRevokedTokenError: isUnauthorizedStatusError,
  },
  actions: {
    validateCredentials: async ({ props }) => buildKlaviyoAuth(props.apiKey),
    listLists: async ({ ctx, props }) => {
      const page = klaviyoListPageInputSchema.parse(props)
      const response = await klaviyoRequest(
        ctx.auth,
        KLAVIYO_LISTS_PATH,
        klaviyoListsResponseSchema,
        { searchParams: pageSearchParams(page) },
        [200],
      )
      return {
        data: response.data,
        nextCursor: extractNextCursor(response.links.next),
      }
    },
    syncProfile: async ({ ctx, props }) => {
      const parsed = klaviyoSyncProfilePropsSchema.parse(props)
      const {
        listId,
        email,
        first_name,
        last_name,
        phone_number,
        title,
        organization,
        properties,
      } = parsed
      const attributes = {
        email,
        ...(first_name ? { first_name } : {}),
        ...(last_name ? { last_name } : {}),
        ...(phone_number ? { phone_number } : {}),
        ...(title ? { title } : {}),
        ...(organization ? { organization } : {}),
        ...(properties ? { properties } : {}),
      }
      const profile = await klaviyoRequest(
        ctx.auth,
        KLAVIYO_PROFILE_IMPORT_PATH,
        klaviyoProfileImportResponseSchema,
        { method: "post", json: { data: { type: "profile", attributes } } },
        [200, 201],
      )

      if (listId) {
        await klaviyoRequest(
          ctx.auth,
          klaviyoListProfilesPath(listId),
          noContentResponseSchema,
          {
            method: "post",
            json: { data: [{ type: "profile", id: profile.data.id }] },
          },
          [204],
        )
      }

      return {
        profileId: profile.data.id,
        email: profile.data.attributes.email,
      }
    },
  },
  disconnect: async () => undefined,
  handleRequest: () =>
    Promise.reject(
      new SdkException("Klaviyo does not expose request handlers"),
    ),
}

export const integration = new Integration(config)
