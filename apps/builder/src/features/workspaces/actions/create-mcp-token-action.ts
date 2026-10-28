"use server"

import { workspaceApiTokenService } from "@chatbotx.io/business"
import { generateWorkspaceToken } from "@chatbotx.io/business/workspace-api-token/credentials"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireWorkspaceTokenSuperAdmin } from "../lib/require-workspace-token-super-admin"

const MCP_TOKEN_NAME = "MCP"

/**
 * One-click token for the "Connect your AI agent" card. Same guarantees as
 * `createWorkspaceTokenAction` (superAdmin only, plaintext returned once),
 * with fixed name/permission/scopes so the card needs no form.
 */
export const createMcpTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => {
    await requireWorkspaceTokenSuperAdmin(workspaceId)

    const { token, tokenHash, tokenPrefix } = await generateWorkspaceToken()

    await workspaceApiTokenService.createToken({
      workspaceId,
      name: MCP_TOKEN_NAME,
      permission: "full",
      tokenHash,
      tokenPrefix,
      scopes: null,
    })

    return { token }
  })
