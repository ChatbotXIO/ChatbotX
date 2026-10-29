import type { DynamicTool } from "../openapi-loader"

type CurrentState = { state: unknown } | { unavailable: string }

type HitlGateOptions = {
  args: Record<string, unknown>
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
  | { args?: never; failure: ConfirmationRequired }

/**
 * Returns a portable two-step confirmation response for every mutating tool.
 * Some clients advertise form elicitation but do not render or resolve it,
 * which otherwise leaves a mutation request pending until the client timeout.
 */
export const enforceHitlGate = async (
  options: HitlGateOptions,
): Promise<HitlGateResult> => {
  const { _confirm: _, ...proposed } = options.args
  if (options.tool.hitlPolicy === "none" || options.args._confirm === true) {
    return { args: proposed }
  }

  const currentState = await options.getCurrentState()
  return {
    failure: {
      code: "CONFIRMATION_REQUIRED",
      ...("unavailable" in currentState
        ? { currentStateUnavailable: currentState.unavailable }
        : { currentState: currentState.state }),
      policy: options.tool.hitlPolicy,
      proposed,
      tool: options.tool.name,
    },
  }
}
