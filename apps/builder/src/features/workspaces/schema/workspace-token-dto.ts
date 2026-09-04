import type { WorkspaceApiTokenModel } from "@chatbotx.io/database/types"

/**
 * Client-safe projection of WorkspaceApiTokenModel — must never include
 * `tokenHash` or `encryptedToken`, which are otherwise indistinguishable
 * from a live credential for anyone who can read them out of the page
 * payload (e.g. via devtools).
 */
export type WorkspaceApiTokenDto = Pick<
  WorkspaceApiTokenModel,
  | "id"
  | "name"
  | "permission"
  | "tokenPrefix"
  | "isDefault"
  | "createdAt"
  | "scopes"
>

export const toWorkspaceApiTokenDto = (
  token: WorkspaceApiTokenModel,
): WorkspaceApiTokenDto => ({
  id: token.id,
  name: token.name,
  permission: token.permission,
  tokenPrefix: token.tokenPrefix,
  isDefault: token.isDefault,
  createdAt: token.createdAt,
  scopes: token.scopes,
})
