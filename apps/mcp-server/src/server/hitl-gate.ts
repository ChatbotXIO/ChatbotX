import type {
  ElicitRequestFormParams,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js"
import type { DynamicTool } from "../openapi-loader"

export const HITL_ELICITATION_TIMEOUT_MS = 10 * 60_000

export type ElicitationClient = {
  supportsFormElicitation: () => boolean
  elicitInput: (
    props: ElicitRequestFormParams,
  ) => Promise<Pick<ElicitResult, "action">>
}

type CurrentState = { state: unknown } | { unavailable: string }

type HitlGateOptions = {
  args: Record<string, unknown>
  elicitationClient?: ElicitationClient
  getCurrentState: () => Promise<CurrentState>
  tool: DynamicTool
}

type ConfirmationRequired = {
  code: "CONFIRMATION_REQUIRED"
  currentState?: unknown
  currentStateUnavailable?: string
  policy: DynamicTool["hitlPolicy"]
  proposed: Record<string, unknown>
  tool: string
}

type HitlGateResult =
  | { args: Record<string, unknown>; failure?: never }
  | { args?: never; failure: ConfirmationRequired | ConfirmationDeclined }

type ConfirmationDeclined = {
  action: Exclude<ElicitResult["action"], "accept">
  code: "CONFIRMATION_DECLINED"
  policy: DynamicTool["hitlPolicy"]
  tool: string
}

const emptyObjectSchema = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const

/**
 * Requires client-mediated elicitation when supported. Clients that do not
 * advertise form elicitation receive a two-step `_confirm: true` fallback; it
 * is a guardrail, not an authorization boundary.
 */
export const enforceHitlGate = async (
  options: HitlGateOptions,
): Promise<HitlGateResult> => {
  const { _confirm: _, ...proposed } = options.args
  if (options.tool.hitlPolicy === "none") {
    return { args: proposed }
  }

  const client = options.elicitationClient
  if (!client?.supportsFormElicitation() && options.args._confirm === true) {
    return { args: proposed }
  }

  const currentState = await options.getCurrentState()
  const failure: ConfirmationRequired = {
    code: "CONFIRMATION_REQUIRED",
    ...("unavailable" in currentState
      ? { currentStateUnavailable: currentState.unavailable }
      : { currentState: currentState.state }),
    policy: options.tool.hitlPolicy,
    proposed,
    tool: options.tool.name,
  }

  if (!client?.supportsFormElicitation()) {
    return { failure }
  }

  const elicitation = await client.elicitInput({
    message: `Review this ChatbotX ${failure.policy} action before approving it:\n${JSON.stringify(failure, null, 2)}`,
    requestedSchema: emptyObjectSchema,
  })
  if (elicitation.action === "accept") {
    return { args: proposed }
  }

  return {
    failure: {
      action: elicitation.action,
      code: "CONFIRMATION_DECLINED",
      policy: options.tool.hitlPolicy,
      tool: options.tool.name,
    },
  }
}
