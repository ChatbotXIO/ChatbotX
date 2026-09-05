import type { OpenAPIGenerator } from "@orpc/openapi"

type PublicSpecDocument = Awaited<
  ReturnType<InstanceType<typeof OpenAPIGenerator>["generate"]>
>

export const PUBLIC_SPEC_VERSION = "0.0.1"

export const WORKSPACE_TOKEN_SECURITY_SCHEMES = {
  bearerAuth: { type: "http", scheme: "bearer" },
  developerAccessToken: { type: "http", scheme: "bearer" },
  tokenInSearchParams: { type: "apiKey", in: "query", name: "token" },
} as const

export const CHANNEL_API_TOKEN_SCHEME = "channelApiToken"

export const PUBLIC_SECURITY_SCHEMES = {
  ...WORKSPACE_TOKEN_SECURITY_SCHEMES,
  [CHANNEL_API_TOKEN_SCHEME]: {
    type: "http",
    scheme: "bearer",
    description: "A channel API token, scoped to a single inbox.",
  },
} as const

const WORKSPACE_TOKEN_SECURITY: Record<string, string[]>[] = [
  { bearerAuth: [] },
  { developerAccessToken: [] },
  { tokenInSearchParams: [] },
]

const CHANNEL_API_TOKEN_SECURITY: Record<string, string[]>[] = [
  { [CHANNEL_API_TOKEN_SCHEME]: [] },
]

// Paths under this prefix require a channel API token, never a workspace
// token — the document-level `security` (workspace-token schemes) does not
// apply to them, so every generated spec must override `security` on these
// operations after generation (oRPC 1.14.5 has no per-operation `security`
// hook — only a document-level default via `specGenerateOptions.security`).
const CHANNEL_API_TOKEN_PATH_PREFIX = "/v1/channels/api/"

export function publicSpecGenerateOptions(title: string) {
  return {
    info: { title, version: PUBLIC_SPEC_VERSION },
    commonSchemas: {
      UndefinedError: { error: "UndefinedError" as const },
    },
    security: WORKSPACE_TOKEN_SECURITY,
    components: { securitySchemes: PUBLIC_SECURITY_SCHEMES },
  }
}

/**
 * Overrides `security` to the channel-token scheme for every
 * `/v1/channels/api/*` operation in a generated spec, so the document is
 * honest about which token type each operation actually requires (the
 * default `security` supplied by `publicSpecGenerateOptions` only covers
 * workspace-token schemes).
 */
export function withChannelApiTokenSecurity(spec: PublicSpecDocument) {
  if (!spec.paths) {
    return spec
  }

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!(pathItem && path.startsWith(CHANNEL_API_TOKEN_PATH_PREFIX))) {
      continue
    }

    for (const operation of Object.values(pathItem)) {
      if (
        operation &&
        typeof operation === "object" &&
        "responses" in operation
      ) {
        ;(operation as { security?: unknown }).security =
          CHANNEL_API_TOKEN_SECURITY
      }
    }
  }

  return spec
}
