import { type EchoOrigin, echoOrigins } from "@chatbotx.io/sdk"
import {
  META_FIRST_PARTY_ECHO_APP_IDS,
  type MessengerAttachment,
  type MessengerMessage,
} from "../schema"

/**
 * What a `message_echoes` event tells us about the message the Page sent.
 * Every field is null/undefined for a message that is not an echo.
 */
export type MessengerEcho = {
  /** Who sent it: the Page's own inbox, another app, or unknown. */
  origin: EchoOrigin | null
  /** Sending app id, for diagnostics. */
  appId: string | null
  /** Text stand-in for a `template` attachment; the body is never stored. */
  templateTitle: string | undefined
}

const NOT_AN_ECHO: MessengerEcho = {
  origin: null,
  appId: null,
  templateTitle: undefined,
}

type TemplateTitleResolver = (
  attachment: MessengerAttachment,
) => string | undefined

const collectTitles = (elements: { title?: string }[] | undefined): string[] =>
  (elements ?? [])
    .map((element) => element.title?.trim() ?? "")
    .filter((title) => title.length > 0)

/**
 * Where a template echo's display text can come from, in priority order
 * (message_echoes reference: button / generic / media / product templates).
 * Media templates carry no title and resolve to nothing. Add a resolver here
 * to support another template shape.
 */
const templateTitleResolvers: TemplateTitleResolver[] = [
  (attachment) => attachment.title?.trim() || undefined,
  (attachment) => attachment.payload.text?.trim() || undefined,
  (attachment) => {
    const titles = [
      ...collectTitles(attachment.payload.elements),
      ...collectTitles(attachment.payload.product?.elements),
    ]
    return titles.length > 0 ? titles.join("\n") : undefined
  },
]

const resolveTemplateTitle = (
  attachments: MessengerAttachment[] | undefined,
): string | undefined => {
  for (const attachment of attachments ?? []) {
    if (attachment.type !== "template") {
      continue
    }
    for (const resolve of templateTitleResolvers) {
      const title = resolve(attachment)
      if (title) {
        return title
      }
    }
  }
  return
}

/**
 * Meta documents `app_id` as a string but ships a JSON number. A number past
 * `Number.MAX_SAFE_INTEGER` has already lost digits in `JSON.parse`, so it is
 * reported as unknown rather than compared against the first-party set.
 */
const resolveAppId = (appId: MessengerMessage["app_id"]): string | null => {
  if (appId === undefined) {
    return null
  }
  if (typeof appId === "number") {
    return Number.isSafeInteger(appId) ? String(appId) : null
  }
  return appId
}

const resolveOrigin = (appId: string | null): EchoOrigin | null => {
  if (appId === null) {
    return null
  }
  return META_FIRST_PARTY_ECHO_APP_IDS.has(appId)
    ? echoOrigins.enum.firstParty
    : echoOrigins.enum.thirdParty
}

/** Interprets the echo-specific fields of a webhook message, if it is one. */
export const parseEcho = (
  message: MessengerMessage | undefined,
): MessengerEcho => {
  if (message?.is_echo !== true) {
    return NOT_AN_ECHO
  }
  const appId = resolveAppId(message.app_id)
  return {
    origin: resolveOrigin(appId),
    appId,
    templateTitle: resolveTemplateTitle(message.attachments),
  }
}
