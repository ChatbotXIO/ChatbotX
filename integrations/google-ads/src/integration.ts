import {
  AuthException,
  ConnectionProviderRejectedError,
  googleOAuthConnection,
  Integration,
  type IntegrationDefinition,
  isGoogleRevokedError,
  probeVerify,
  SdkException,
} from "@chatbotx.io/sdk"
import {
  dataManagerIngestEvent,
  retrieveRequestStatus,
} from "./apis/data-manager"
import {
  getCustomer,
  getUploadClickConversionReport,
  listUploadClickConversionActions,
} from "./apis/google-ads"
import { legacyUploadClickConversion } from "./apis/legacy-upload"
import { collectCandidateAccounts, toCandidate } from "./candidates"
import { getClient } from "./client"
import { addGoogleAdsIdentity } from "./connection-auth"
import {
  classifyGoogleAdsFailure,
  GOOGLE_ADS_FAILURE_MESSAGES,
} from "./lib/failure-cause"
import { sanitizeGoogleAdsError } from "./lib/sanitize"
import {
  authorizeScopesFor,
  hasRequiredScopes,
  parseUploadMethod,
  SCOPE_MISSING_MESSAGES,
  uploadMethodOf,
} from "./lib/scopes"
import type {
  GoogleAdsActions,
  GoogleAdsAuthValue,
  GoogleAdsConfig,
  GoogleAdsIngestOutcome,
} from "./schemas"

// Two statically configured adapters, one per upload method: each requests
// only the scopes its method needs. The credential's method picks one.
const googleConnections = {
  dataManager: googleOAuthConnection<GoogleAdsConfig>({
    getClient,
    scopes: authorizeScopesFor("dataManager"),
  }),
  legacy: googleOAuthConnection<GoogleAdsConfig>({
    getClient,
    scopes: authorizeScopesFor("legacy"),
  }),
}

const googleConnectionFor = (credential: GoogleAdsConfig) =>
  googleConnections[parseUploadMethod(credential.uploadMethod)]

const ALREADY_INVALID_PATTERN = /invalid_token|invalid_grant/
const HTTP_BAD_REQUEST = 400

/** Google's answer to revoking a token that is already expired or revoked. */
const isAlreadyInvalidTokenError = (error: unknown): boolean => {
  const status =
    typeof error === "object" && error !== null && "response" in error
      ? (error.response as { status?: unknown } | null)?.status
      : undefined
  return (
    status === HTTP_BAD_REQUEST &&
    error instanceof Error &&
    ALREADY_INVALID_PATTERN.test(error.message)
  )
}

const customerOf = (auth: GoogleAdsAuthValue): string => {
  const customerId = auth.metadata.customerId
  if (!customerId) {
    throw new Error("Google Ads auth has no customer identity")
  }
  return customerId
}

const config: IntegrationDefinition<
  GoogleAdsConfig,
  GoogleAdsAuthValue,
  GoogleAdsActions
> = {
  name: "googleAds",
  connection: {
    kind: "integration",
    strategy: "oauth_redirect",
    multiAccount: true,
    configFields: [],
    authorizeUrl: (input) =>
      googleConnectionFor(input.credential).authorizeUrl(input),
    exchangeCode: async (input) =>
      await addGoogleAdsIdentity(
        await googleConnectionFor(input.credential).exchangeCode(input),
        {
          developerToken: input.credential.developerToken || undefined,
          credentialMethod: parseUploadMethod(input.credential.uploadMethod),
        },
      ),
    listCandidates: async ({ auth }) => {
      try {
        const accounts = await collectCandidateAccounts({
          accessToken: auth.tokens.accessToken,
          developerToken: auth.metadata.developerToken,
        })
        return accounts.map((account) => toCandidate(auth, account))
      } catch (err) {
        const failure = classifyGoogleAdsFailure(err)
        if (failure === "no_ads_account") {
          return []
        }
        if (failure) {
          throw new ConnectionProviderRejectedError(
            GOOGLE_ADS_FAILURE_MESSAGES[failure],
            err,
            failure,
          )
        }
        throw err
      }
    },
    describe: (auth) => ({
      sourceId: customerOf(auth),
      displayName:
        auth.metadata.descriptiveName ?? auth.metadata.email ?? "Google Ads",
      authExpiresAt: auth.tokens.expiresAt,
    }),
    candidateToConfig: (auth) => ({
      customerId: auth.metadata.customerId,
      loginCustomerId: auth.metadata.loginCustomerId ?? null,
      descriptiveName: auth.metadata.descriptiveName ?? null,
      currencyCode: auth.metadata.currencyCode ?? null,
    }),
    // Credential-level health only: the developer token is not stored with the
    // connection, so Google Ads reachability is checked by the setup service.
    verify: async ({ auth }) => {
      // Connections whose grant lacks a scope their method needs can never
      // deliver (the user unticked it): flag them for reconnect. A row without
      // a recorded scope predates the check and is left alone.
      if (!hasRequiredScopes(auth)) {
        return {
          ok: false,
          revoked: true,
          error: SCOPE_MISSING_MESSAGES[uploadMethodOf(auth)],
        }
      }
      return await probeVerify(
        async () => {
          const client = getClient(auth)
          const accessToken = await client.getAccessToken()
          await client.getTokenInfo(
            accessToken.token ?? auth.tokens.accessToken,
          )
        },
        {
          label: "Google Ads credentials",
          expiresAt: auth.tokens.expiresAt,
          isRevoked: isGoogleRevokedError,
        },
      )
    },
    isRevokedTokenError: isGoogleRevokedError,
  },
  actions: {
    resolveConversionCustomer: async ({ ctx, props }) => {
      const customer = await getCustomer(
        {
          accessToken: ctx.auth.tokens.accessToken,
          developerToken: props.developerToken,
          loginCustomerId: ctx.auth.metadata.loginCustomerId,
        },
        customerOf(ctx.auth),
      )
      if (!customer) {
        throw new SdkException("Google Ads customer was not found")
      }
      return customer
    },
    getConversionReport: async ({ ctx, props }) =>
      await getUploadClickConversionReport(
        {
          accessToken: ctx.auth.tokens.accessToken,
          developerToken: props.developerToken,
          loginCustomerId: ctx.auth.metadata.loginCustomerId,
        },
        props.conversionCustomerId,
        { from: props.from, to: props.to },
      ),
    listConversionActions: async ({ ctx, props }) =>
      await listUploadClickConversionActions(
        {
          accessToken: ctx.auth.tokens.accessToken,
          developerToken: props.developerToken,
          loginCustomerId: ctx.auth.metadata.loginCustomerId,
        },
        props.conversionCustomerId,
      ),
    // Routed by the EVENT's pinned method, never by the connection's current one.
    ingestEvent: async ({ ctx, props }): Promise<GoogleAdsIngestOutcome> => {
      if (parseUploadMethod(props.uploadMethod) === "legacy") {
        return await legacyUploadClickConversion({
          accessToken: ctx.auth.tokens.accessToken,
          developerToken: props.developerToken,
          loginAccountId: props.loginAccountId,
          operatingAccountId: props.operatingAccountId,
          conversionActionId: props.conversionActionId,
          event: props.event,
          validateOnly: props.validateOnly,
        })
      }
      const accepted = await dataManagerIngestEvent({
        accessToken: ctx.auth.tokens.accessToken,
        loginAccountId: props.loginAccountId,
        operatingAccountId: props.operatingAccountId,
        conversionActionId: props.conversionActionId,
        event: props.event,
        validateOnly: props.validateOnly,
      })
      return { kind: "accepted", ...accepted }
    },
    retrieveRequestStatus: async ({ ctx, props }) =>
      await retrieveRequestStatus({
        accessToken: ctx.auth.tokens.accessToken,
        requestId: props.requestId,
      }),
  },
  // Connect callbacks are served by the connection engine, not by this adapter.
  handleRequest: ({ req }) => {
    throw new SdkException(
      `Handler: ${req.method} ${req.url} is not implemented`,
    )
  },
  disconnect: async (auth): Promise<void> => {
    // The refresh token revokes the whole grant and never expires; an expired
    // access token would make Google answer 400 invalid_token.
    try {
      await getClient(auth).revokeToken(
        auth.tokens.refreshToken ?? auth.tokens.accessToken,
      )
    } catch (error) {
      // Already revoked/expired is the state disconnect wants: not fatal.
      if (!isAlreadyInvalidTokenError(error)) {
        throw new SdkException(
          `Google Ads token revoke failed: ${sanitizeGoogleAdsError(error).message}`,
        )
      }
    }
  },
  refreshAuth: async ({ auth }) => {
    if (!auth.tokens.refreshToken) {
      throw new AuthException("Google Ads refresh token not available")
    }
    try {
      const { credentials } = await getClient(auth).refreshAccessToken()
      if (!credentials.access_token) {
        throw new AuthException("Google Ads refresh returned no token")
      }
      return {
        ...auth,
        tokens: {
          ...auth.tokens,
          accessToken: credentials.access_token,
          refreshToken:
            credentials.refresh_token ?? auth.tokens.refreshToken ?? null,
          expiresAt: credentials.expiry_date
            ? new Date(credentials.expiry_date).toISOString()
            : auth.tokens.expiresAt,
        },
      }
    } catch (error) {
      if (error instanceof AuthException) {
        throw error
      }
      // The raw error (a gaxios error) carries the request config, i.e. the
      // refresh token and client secret, so it is never attached as an origin.
      if (isGoogleRevokedError(error)) {
        throw new AuthException("Google Ads refresh token was revoked")
      }
      throw new SdkException(
        `Google Ads token refresh failed: ${sanitizeGoogleAdsError(error).message}`,
      )
    }
  },
}

export const integration = new Integration(config)
