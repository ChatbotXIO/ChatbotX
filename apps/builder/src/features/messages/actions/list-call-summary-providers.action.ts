"use server"

import { listConnectedCallSummaryProviders } from "@chatbotx.io/ai/server"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

/**
 * Connected AI integrations the workspace can use to generate a call
 * summary — reuses the same legacy AI-integration
 * registry (`getAIIntegrationInDB`) the flow builder's AI steps and
 * `summarizeConversation` already read from. Empty when nothing is
 * connected — the provider-picker dialog renders "Connect an AI provider"
 * in that case, never an error. A read action — allowed even for an
 * expired/owner-blocked workspace (AGENTS.md invariant #14).
 *
 * No `.inputSchema` (bind args only) — callers invoke the action with
 * just the bound `workspaceId`, no trailing input argument.
 */
export const listCallSummaryProvidersAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => ({
    providers: await listConnectedCallSummaryProviders(workspaceId),
  }))
