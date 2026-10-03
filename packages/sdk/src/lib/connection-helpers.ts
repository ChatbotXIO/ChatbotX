import {
  AuthType,
  type AuthValue,
  type Oauth2AuthValue,
  type Oauth2Config,
} from "./auth"
import type {
  ConnectionConfigField,
  ConnectionDescriptor,
  ConnectionHealth,
  ConnectionKind,
  ConnectionProvider,
} from "./connection"
import type { Handler } from "./shared"

type ProbeVerifyOptions = {
  label: string
  isRevoked?: (error: unknown) => boolean
  expiresAt?: string
}

type OAuth2Tokens = Oauth2AuthValue["tokens"]
type OAuth2Config = Pick<
  Oauth2AuthValue,
  "clientId" | "clientSecret" | "verifyToken" | "version"
>
type OAuth2AuthWithMetadata<IMetadata extends Oauth2AuthValue["metadata"]> =
  Oauth2AuthValue &
    (IMetadata extends Record<string, unknown>
      ? { metadata: IMetadata }
      : object)

/** Converts a provider probe into a stable connection-health result. */
export const probeVerify = async (
  probe: () => Promise<unknown>,
  options: ProbeVerifyOptions,
): Promise<ConnectionHealth> => {
  try {
    await probe()
    return options.expiresAt
      ? { ok: true, authExpiresAt: options.expiresAt }
      : { ok: true }
  } catch (error) {
    return {
      ok: false,
      revoked: options.isRevoked?.(error) ?? false,
      error:
        error instanceof Error
          ? error.message
          : `Unable to verify ${options.label}`,
    }
  }
}

/** Identifies Google OAuth failures that require replacing stored credentials. */
export const isGoogleRevokedError = (error: unknown): boolean => {
  if (!(error instanceof Error && "response" in error)) {
    return false
  }

  const response = error.response
  if (!response || typeof response !== "object" || !("status" in response)) {
    return false
  }

  const status = typeof response.status === "number" ? response.status : null
  return (
    status === 401 ||
    (status === 400 && error.message.includes("invalid_grant"))
  )
}

/** Creates OAuth2 auth with the exact callback URL used for the exchange. */
export const oauth2Auth = <
  IMetadata extends Oauth2AuthValue["metadata"] = undefined,
>(
  config: OAuth2Config,
  callbackUrl: string,
  tokens: OAuth2Tokens,
  metadata?: IMetadata,
): OAuth2AuthWithMetadata<IMetadata> =>
  ({
    authType: AuthType.oauth2,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUrl: callbackUrl,
    ...(config.verifyToken ? { verifyToken: config.verifyToken } : {}),
    ...(config.version ? { version: config.version } : {}),
    tokens,
    ...(metadata ? { metadata } : {}),
  }) as OAuth2AuthWithMetadata<IMetadata>
type GoogleTokenResponse = {
  access_token?: string | null
  expiry_date?: number | null
  refresh_token?: string | null
  scope?: string | null
}

type GoogleOAuthClient = {
  generateAuthUrl: (options: {
    access_type: "offline"
    prompt: "consent"
    scope: string[]
    state: string
  }) => string
  getToken: (code: string) => Promise<{ tokens: GoogleTokenResponse }>
}

type GoogleOAuthConnectionOptions<IConfig extends Oauth2Config> = {
  getClient: (config: IConfig) => GoogleOAuthClient
  scopes: readonly string[]
  mapAuth?: (auth: Oauth2AuthValue) => AuthValue | Promise<AuthValue>
}

export const googleTokensToAuth = (
  config: OAuth2Config,
  callbackUrl: string,
  tokens: GoogleTokenResponse,
): Oauth2AuthValue => {
  if (!tokens.access_token) {
    throw new Error("Google OAuth response has no access token")
  }

  if (!tokens.refresh_token) {
    throw new Error("Google OAuth response has no refresh token")
  }

  return {
    ...oauth2Auth(config, callbackUrl, {
      accessToken: tokens.access_token,
      expiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : undefined,
      refreshToken: tokens.refresh_token,
    }),
    metadata: { scope: tokens.scope },
  }
}

export const googleOAuthConnection = <IConfig extends Oauth2Config>(
  options: GoogleOAuthConnectionOptions<IConfig>,
) => ({
  authorizeUrl: ({
    credential,
    callbackUrl,
    state,
  }: {
    credential: unknown
    callbackUrl: string
    state: string
  }) =>
    options
      .getClient({ ...(credential as IConfig), redirectUrl: callbackUrl })
      .generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [...options.scopes],
        state,
      }),
  exchangeCode: async ({
    code,
    callbackUrl,
    credential,
  }: {
    code: string
    callbackUrl: string
    credential: unknown
  }): Promise<AuthValue> => {
    const config = {
      ...(credential as IConfig),
      redirectUrl: callbackUrl,
    }
    const { tokens } = await options.getClient(config).getToken(code)
    const auth = googleTokensToAuth(config, callbackUrl, tokens)
    return options.mapAuth ? await options.mapAuth(auth) : auth
  },
})
type FacebookDialogOptions = {
  clientId: string
  callbackUrl: string
  scopes: readonly string[]
  state: string
  version: string
  authType?: string
}

export const buildFacebookDialogUrl = (
  options: FacebookDialogOptions,
): string => {
  // State is an opaque signed token; URLSearchParams performs its only encoding.
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.callbackUrl,
    scope: options.scopes.join(","),
    response_type: "code",
    state: options.state,
  })
  if (options.authType) {
    params.set("auth_type", options.authType)
  }
  return `https://www.facebook.com/${options.version}/dialog/oauth?${params.toString()}`
}

type MetaTokenAuth = {
  clientId: string
  clientSecret: string
  tokens: { accessToken: string; expiresAt?: string }
  metadata: { version: string }
}

type VerifyGraphTokenOptions = {
  label: string
  debugToken: (input: {
    inputToken: string
    appAccessToken: string
    version: string
  }) => Promise<{ is_valid?: boolean }>
  isRevoked?: (error: unknown) => boolean
}

export const verifyGraphToken =
  <IAuth extends MetaTokenAuth>(options: VerifyGraphTokenOptions) =>
  async ({ auth }: { auth: IAuth }): Promise<ConnectionHealth> => {
    const invalidTokenError = new Error(
      `${options.label} access token is invalid`,
    )
    return await probeVerify(
      async () => {
        const token = await options.debugToken({
          inputToken: auth.tokens.accessToken,
          appAccessToken: `${auth.clientId}|${auth.clientSecret}`,
          version: auth.metadata.version,
        })
        if (token.is_valid === false) {
          throw invalidTokenError
        }
        if (token.is_valid !== true) {
          throw new Error(
            `${options.label} token verification returned no validity state`,
          )
        }
      },
      {
        label: options.label,
        expiresAt: auth.tokens.expiresAt,
        isRevoked: (error) =>
          error === invalidTokenError || options.isRevoked?.(error) === true,
      },
    )
  }

type ApiKeyConnectionOptions<IAuth extends AuthValue, IConfig> = {
  displayName: string
  fields?: readonly ConnectionConfigField[]
  buildAuth: (config: IConfig) => Promise<IAuth>
  probe: (auth: IAuth) => Promise<unknown>
  isRevoked?: (error: unknown) => boolean
}

export const apiKeyConnection = <IAuth extends AuthValue, IConfig>(
  options: ApiKeyConnectionOptions<IAuth, IConfig>,
): ConnectionProvider<IAuth, IConfig> & {
  fromCredentials: Handler<IConfig, IAuth>
} => ({
  kind: "integration",
  strategy: "api_key",
  multiAccount: false,
  configFields: options.fields ?? [],
  describe: () => ({
    sourceId: "workspace",
    displayName: options.displayName,
  }),
  fromCredentials: async (config) => {
    const auth = await options.buildAuth(config)
    await options.probe(auth)
    return auth
  },
  verify: async ({ auth }) =>
    await probeVerify(() => options.probe(auth), {
      label: options.displayName,
      isRevoked: options.isRevoked,
    }),
  isRevokedTokenError: options.isRevoked,
})

type SelfServeConnectionOptions<IAuth extends AuthValue> = {
  displayName: string
  multiAccount: false
  configFields?: readonly ConnectionConfigField[]
  kind?: ConnectionKind
  describe?: (auth: IAuth) => ConnectionDescriptor
}

export const selfServeConnection = <IAuth extends AuthValue>(
  options: SelfServeConnectionOptions<IAuth>,
): ConnectionProvider<IAuth> => ({
  kind: options.kind ?? "channel",
  strategy: "self_serve",
  multiAccount: options.multiAccount,
  configFields: options.configFields ?? [],
  describe:
    options.describe ??
    (() => ({ sourceId: "workspace", displayName: options.displayName })),
  verify: async () => ({ ok: true }),
})
