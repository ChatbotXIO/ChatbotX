import type { WorkspaceApiTokenModel } from "@chatbotx.io/database/types"

/**
 * Client-safe projection of WorkspaceApiTokenModel — must never include
 * `tokenHash`, which is otherwise indistinguishable from a live credential
 * for anyone who can read it out of the page payload (e.g. via devtools).
 */
export type WorkspaceApiTokenDto = Pick<
  WorkspaceApiTokenModel,
  "id" | "name" | "permission" | "tokenPrefix" | "createdAt"
>

export const toWorkspaceApiTokenDto = (
  token: WorkspaceApiTokenModel,
): WorkspaceApiTokenDto => ({
  id: token.id,
  name: token.name,
  permission: token.permission,
  tokenPrefix: token.tokenPrefix,
  createdAt: token.createdAt,
})
