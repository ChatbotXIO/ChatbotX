import { resolveFilterTimezone } from "@chatbotx.io/utils"
import { logger } from "../logger"

/**
 * Working hours are evaluated in the workspace timezone. An invalid or empty
 * zone falls back to UTC (and warns) so a bad setting never throws on the
 * reply path.
 */
export function resolveWorkingHoursTimezone(workspace: {
  id?: string
  timezone?: string | null
}): string {
  const timezone = workspace.timezone
  const resolved = resolveFilterTimezone(timezone)
  if (timezone && resolved !== timezone) {
    logger.warn(
      {
        err: new Error(`Invalid workspace timezone: ${timezone}`),
        workspaceId: workspace.id,
      },
      "Invalid workspace timezone for working hours, falling back to UTC",
    )
  }
  return resolved
}
