import { resolveBotFieldVariableText } from "@chatbotx.io/variables"

/**
 * Keeps MCP credentials workspace-scoped. Contact variables deliberately do
 * not participate in credential resolution.
 */
export const createMcpTokenResolver =
  (workspaceId: string) => async (token: string) => {
    const resolution = await resolveBotFieldVariableText({
      text: token,
      workspaceId,
    })
    return resolution.status === "resolved"
      ? { status: "resolved" as const, token: resolution.value }
      : { reason: resolution.reason, status: "unresolved" as const }
  }
