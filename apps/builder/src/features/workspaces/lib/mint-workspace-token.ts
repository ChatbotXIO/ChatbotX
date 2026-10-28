import { workspaceApiTokenService } from "@chatbotx.io/business"
import { generateWorkspaceToken } from "@chatbotx.io/business/workspace-api-token/credentials"
import { requireWorkspaceTokenSuperAdmin } from "./require-workspace-token-super-admin"

type CreateTokenInput = Parameters<
  typeof workspaceApiTokenService.createToken
>[0]

interface MintWorkspaceTokenInput {
  name: string
  permission: CreateTokenInput["permission"]
  scopes: CreateTokenInput["scopes"]
}

/**
 * Super-admin guard + generate + persist. The plaintext exists only in the
 * return value — never persisted.
 */
export async function mintWorkspaceToken(
  workspaceId: string,
  { name, permission, scopes }: MintWorkspaceTokenInput,
): Promise<{ token: string }> {
  await requireWorkspaceTokenSuperAdmin(workspaceId)

  const { token, tokenHash, tokenPrefix } = await generateWorkspaceToken()

  await workspaceApiTokenService.createToken({
    workspaceId,
    name,
    permission,
    tokenHash,
    tokenPrefix,
    scopes,
  })

  return { token }
}
