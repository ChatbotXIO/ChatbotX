import type { MessagingAdsToolIntegration } from "../queries/tool-integrations"

type SelectMessagingAdsToolIntegrationInput = {
  integrations: MessagingAdsToolIntegration[]
  requestedId: string
  activeIntegrationIds: string[]
}

type ToolIntegrationResolver = (
  input: SelectMessagingAdsToolIntegrationInput,
) => MessagingAdsToolIntegration | null

/**
 * The `?integration=` param wins outright when it still names an eligible
 * integration for this channel — an unknown/stale id (a deleted
 * integration, or another channel's id pasted into the URL) falls through
 * to the next strategy instead of erroring.
 */
const preferRequested: ToolIntegrationResolver = ({
  integrations,
  requestedId,
}) => {
  if (!requestedId) {
    return null
  }
  return (
    integrations.find((integration) => integration.id === requestedId) ?? null
  )
}

/**
 * No (or an unknown) requested id: prefer the first integration that
 * already has an `active` messaging-ads connection, so landing on the tool
 * page fresh (or after a Connect flow) shows the account the user actually
 * connected instead of resetting to list order.
 */
const preferActive: ToolIntegrationResolver = ({
  integrations,
  activeIntegrationIds,
}) =>
  integrations.find((integration) =>
    activeIntegrationIds.includes(integration.id),
  ) ?? null

/**
 * Nothing requested, nothing active yet: fall back to the first eligible
 * integration so a first-time visitor sees a box (in its "not connected"
 * state) instead of an empty select.
 */
const preferFirst: ToolIntegrationResolver = ({ integrations }) =>
  integrations[0] ?? null

const TOOL_INTEGRATION_RESOLVERS: ToolIntegrationResolver[] = [
  preferRequested,
  preferActive,
  preferFirst,
]

/**
 * Pure selection for which integration the tool page's filter + box should
 * show. An ordered list of resolver strategies (requested wins -> prefer
 * active -> prefer first -> none) rather than nested ifs — each strategy is
 * independently readable and testable (Phase 7).
 */
export function selectMessagingAdsToolIntegration(
  input: SelectMessagingAdsToolIntegrationInput,
): MessagingAdsToolIntegration | null {
  for (const resolve of TOOL_INTEGRATION_RESOLVERS) {
    const result = resolve(input)
    if (result) {
      return result
    }
  }
  return null
}
