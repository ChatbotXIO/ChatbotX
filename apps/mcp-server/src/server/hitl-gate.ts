import type { ElicitRequestFormParams } from "@modelcontextprotocol/sdk/types.js"
import type { DynamicTool } from "../openapi-loader"
import type { ToolCallResult } from "./execute-tool"

export type ElicitationClient = {
  supportsFormElicitation: () => boolean
  elicitInput: (props: ElicitRequestFormParams) => Promise<{ action: string }>
}

type HitlGateOptions = {
  args: Record<string, unknown>
  elicitationClient?: ElicitationClient
  getCurrentState: () => Promise<unknown | undefined>
  tool: DynamicTool
}

type HitlGateResult =
  | { args: Record<string, unknown>; result?: never }
  | { args?: never; result: ToolCallResult }

const emptyObjectSchema = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const

type ConfirmationPayload = {
  code: "CONFIRMATION_REQUIRED"
  currentState: unknown | undefined
  policy: DynamicTool["hitlPolicy"]
  proposed: Record<string, unknown>
  tool: string
}

const withoutConfirmationArgument = (
  args: Record<string, unknown>,
): Record<string, unknown> => {
  const { _confirm: _, ...proposed } = args
  return proposed
}

const jsonToolResult = (value: unknown, isError = false): ToolCallResult => ({
  content: [{ text: JSON.stringify(value, null, 2), type: "text" }],
  ...(isError ? { isError: true } : {}),
})

const confirmationPayload = (props: {
  currentState: unknown | undefined
  policy: DynamicTool["hitlPolicy"]
  proposed: Record<string, unknown>
  toolName: string
}): ConfirmationPayload => ({
  code: "CONFIRMATION_REQUIRED",
  currentState: props.currentState,
  policy: props.policy,
  proposed: props.proposed,
  tool: props.toolName,
})

const confirmationMessage = (payload: ConfirmationPayload) =>
  `Review this ChatbotX ${payload.policy} action before approving it:\n${JSON.stringify(payload, null, 2)}`

/**
 * Requires client-mediated elicitation when supported. Older clients receive a
 * two-step `_confirm: true` fallback; it is a guardrail, not an authorization
 * boundary, so the response exposes the proposed action and current state.
 */
export const enforceHitlGate = async (
  options: HitlGateOptions,
): Promise<HitlGateResult> => {
  const proposed = withoutConfirmationArgument(options.args)
  if (options.tool.hitlPolicy === "none") {
    return { args: proposed }
  }

  const client = options.elicitationClient
  if (client?.supportsFormElicitation()) {
    const currentState = await options.getCurrentState()
    const payload = confirmationPayload({
      currentState,
      policy: options.tool.hitlPolicy,
      proposed,
      toolName: options.tool.name,
    })
    const elicitation = await client.elicitInput({
      message: confirmationMessage(payload),
      requestedSchema: emptyObjectSchema,
    })
    if (elicitation.action === "accept") {
      return { args: proposed }
    }
    return {
      result: jsonToolResult(
        {
          code: "CONFIRMATION_DECLINED",
          policy: options.tool.hitlPolicy,
          tool: options.tool.name,
        },
        true,
      ),
    }
  }

  if (options.args._confirm === true) {
    return { args: proposed }
  }

  const currentState = await options.getCurrentState()
  return {
    result: jsonToolResult(
      confirmationPayload({
        currentState,
        policy: options.tool.hitlPolicy,
        proposed,
        toolName: options.tool.name,
      }),
      true,
    ),
  }
}
