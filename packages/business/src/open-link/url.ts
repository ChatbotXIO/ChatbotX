import {
  signOpenLinkUrl,
  verifyOpenLinkUrl,
} from "@chatbotx.io/encryption/open-link-token"
import { matchDeepLinkApp } from "@chatbotx.io/flow-config"
import type { ChannelType } from "@chatbotx.io/utils/channel"

/**
 * Build the interstitial URL a flow button's destination is replaced with.
 *
 * Shape: `<appUrl>/go/<workspaceId>?u=<base64url(destination)>&s=<hmac>`. The
 * signature is deterministic, so one destination always maps to one URL — see
 * `signOpenLinkUrl` for why that matters to Facebook's crawler.
 */
export const buildOpenLinkUrl = (props: {
  appUrl: string
  workspaceId: string
  url: string
}): string => {
  const target = new URL(`/go/${props.workspaceId}`, props.appUrl)
  target.searchParams.set(
    "u",
    Buffer.from(props.url, "utf8").toString("base64url"),
  )
  target.searchParams.set(
    "s",
    signOpenLinkUrl({ workspaceId: props.workspaceId, url: props.url }),
  )
  return target.toString()
}

const isSameOrigin = (url: string, appUrl: string): boolean => {
  try {
    return new URL(url).origin === new URL(appUrl).origin
  } catch {
    return false
  }
}

/**
 * The destination to put on an `openWebsite` button.
 *
 * Only a destination in `DEEP_LINK_APPS` takes the detour through the
 * interstitial; every other link is returned untouched and keeps going straight
 * to where it always went. Narrow on purpose — a detour that cannot open an app
 * is pure overhead, and it puts the builder in the path of a link that did not
 * need it.
 *
 * Returns `url` unchanged — never throws — so a caller can apply it blindly to
 * every button.
 */
export const wrapOpenLinkUrl = (props: {
  appUrl: string
  workspaceId: string
  url: string
  /** The channel this message is being sent through. */
  channel?: string
}): string => {
  const { appUrl, workspaceId, url, channel } = props

  if (!(appUrl && url)) {
    return url
  }

  const app = matchDeepLinkApp(url)
  if (!app) {
    return url
  }

  // A variable that never resolved would be signed as literal `{{...}}` text
  // and the contact would land on a dead link with no way back. Shouldn't reach
  // here — the send path interpolates first — but the cost of the guard is one
  // string search.
  if (url.includes("{{")) {
    return url
  }

  // A link to an app, sent through that same app's channel, already opens
  // natively — the interstitial would only add a hop.
  if (app.channel && channel && app.channel === (channel as ChannelType)) {
    return url
  }

  // No app in the table can be same-origin with the builder today, so this is a
  // guard for the day one is added: `/booking/picker` runs on Messenger
  // Extensions and breaks if wrapped, and magic links `/r/<workspaceId>/<name>`
  // are matched downstream by `isMagicLinkUrl`'s pathname regex — wrap one and
  // `appendCodeToMagicLink` stops matching, so `?code=` is never attached and
  // every click on it goes unattributed.
  if (isSameOrigin(url, appUrl)) {
    return url
  }

  return buildOpenLinkUrl({ appUrl, workspaceId, url })
}

/**
 * Recover the destination the interstitial should send the contact to.
 *
 * Returns `null` for anything that fails authentication, so the route can
 * render an error instead of redirecting — a `/go` page that redirects to an
 * unverified URL is an open redirect. The scheme check matters even for a valid
 * signature: it is what stops a `javascript:` or `data:` payload from ever being
 * rendered as an href.
 */
export const resolveOpenLinkDestination = (props: {
  workspaceId: string
  u: string | null | undefined
  s: string | null | undefined
}): string | null => {
  const { workspaceId, u, s } = props
  if (!(u && s)) {
    return null
  }

  let url: string
  try {
    url = Buffer.from(u, "base64url").toString("utf8")
  } catch {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null
  }

  return verifyOpenLinkUrl({ workspaceId, url }, s) ? url : null
}
