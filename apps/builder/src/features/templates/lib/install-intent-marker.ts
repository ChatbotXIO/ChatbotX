/**
 * Tells the browser a share page's choice is pending, so screens outside the
 * channel flow can end it. Holds no secret: the choice itself stays server-side.
 */
export const INSTALL_INTENT_MARKER_COOKIE = "template-install-intent"

export const INSTALL_INTENT_MARKER_MAX_AGE_SECONDS = 300

/** The screens of creating a workspace; anywhere else ends the choice. */
const CHANNEL_FLOW_PATHS = ["/channels", "/connect", "/auth"]

export const isChannelFlowPath = (pathname: string): boolean =>
  CHANNEL_FLOW_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )

/**
 * The channel picker as a share page opens it. The picker keeps its query, so
 * this marks the whole flow; `/channels/create` reached any other way (the
 * workspace switcher, a failed connect) has nothing to do with that choice.
 */
export const CREATE_WORKSPACE_FROM_TEMPLATE_PATH =
  "/channels/create?fromTemplate=1"

/** Whether `/channels/create` with this query continues a share page's flow. */
export const continuesInstallIntent = (query: {
  fromTemplate?: string | null
  workspaceId?: string | null
}): boolean => query.fromTemplate === "1" && !query.workspaceId
