"use server"

import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { mintWorkspaceToken } from "../lib/mint-workspace-token"

const MCP_TOKEN_NAME = "MCP"

/**
 * One-click token for the "Connect your AI agent" card. Same guarantees as
 * `createWorkspaceTokenAction` (superAdmin only, plaintext returned once),
 * with fixed name/permission/scopes so the card needs no form.
 */
export const createMcpTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId] }) =>
      await mintWorkspaceToken(workspaceId, {
        name: MCP_TOKEN_NAME,
        permission: "full",
        scopes: null,
      }),
  )
