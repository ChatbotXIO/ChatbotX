import type { integrationMetaCatalogService } from "@chatbotx.io/business"

type MetaCatalogConnection = NonNullable<
  Awaited<ReturnType<typeof integrationMetaCatalogService.findByWorkspaceId>>
>

/** The connection minus its credential — the only shape safe to send to a client. */
export type SafeMetaCatalogConnection = Omit<
  MetaCatalogConnection,
  "encryptedAuth"
>

/**
 * The stored connection carries the workspace's encrypted Meta credential, and
 * both the products page and the state action hand the rest of it to the
 * browser. Stripping it here rather than at each call site means the guarantee
 * is written once and a new caller cannot forget it.
 */
export const toSafeMetaCatalogConnection = (
  connection: MetaCatalogConnection | null | undefined,
): SafeMetaCatalogConnection | null => {
  if (!connection) {
    return null
  }
  const { encryptedAuth: _encryptedAuth, ...safeConnection } = connection
  return safeConnection
}
