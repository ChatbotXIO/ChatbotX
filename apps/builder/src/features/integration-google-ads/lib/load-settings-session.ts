import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  type ConnectErrorQueryCode,
  connectErrorQueryCodes,
} from "@chatbotx.io/utils/connection"
import { GOOGLE_ADS_PROVIDER } from "./constants"

export type SettingsSession = { id: string; status: string } | null

/**
 * Statuses worth resuming on a plain page load. A `pending` session is an
 * authorization the user never came back from (closed tab, failed callback):
 * showing "waiting for Google" for it would hang the page until it expires.
 */
const RESUMABLE_WITHOUT_PARAM: ReadonlySet<string> = new Set([
  "authorized",
  "awaiting_selection",
])

const SESSION_ID_PATTERN = /^\d{1,20}$/

/** The `?session=` value when it is a well-formed id, else `undefined`. */
const parseSessionParam = (
  raw: string | string[] | undefined,
): string | undefined => {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && SESSION_ID_PATTERN.test(value) ? value : undefined
}

/**
 * The connect session the settings page should show. The OAuth round trip
 * returns with `?session={id}`, which is honoured in ANY status (so a denied /
 * failed / expired / cancelled attempt still surfaces its error); both lookups
 * are scoped to the workspace and the Google Ads provider. Without a usable
 * param the newest unexpired in-flight session is resumed, but only once the
 * user is back from Google (see {@link RESUMABLE_WITHOUT_PARAM}).
 */
export async function loadSettingsSession(input: {
  workspaceId: string
  sessionParam: string | string[] | undefined
}): Promise<SettingsSession> {
  const sessionId = parseSessionParam(input.sessionParam)
  if (sessionId) {
    const requested = await connectSessionService.findByIdForWorkspace({
      id: sessionId,
      workspaceId: input.workspaceId,
    })
    if (requested && requested.provider === GOOGLE_ADS_PROVIDER) {
      return { id: requested.id, status: requested.status }
    }
  }
  const inFlight = await connectSessionService.findLatestInFlightByProvider({
    workspaceId: input.workspaceId,
    provider: GOOGLE_ADS_PROVIDER,
  })
  return inFlight && RESUMABLE_WITHOUT_PARAM.has(inFlight.status)
    ? { id: inFlight.id, status: inFlight.status }
    : null
}

/**
 * The `?connect_error=` value when it is one of the known codes, else `null`.
 * The parameter is attacker-controllable (anyone can craft the link), so an
 * unknown or repeated value is dropped rather than shown or echoed.
 */
export const parseConnectErrorParam = (
  raw: string | string[] | undefined,
): ConnectErrorQueryCode | null => {
  const parsed = connectErrorQueryCodes.safeParse(
    Array.isArray(raw) ? raw[0] : raw,
  )
  return parsed.success ? parsed.data : null
}
