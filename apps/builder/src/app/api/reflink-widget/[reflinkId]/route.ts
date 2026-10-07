import { reflinkService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { type NextRequest, NextResponse } from "next/server"
import { createTranslator } from "next-intl"
import { isEmbedOriginAllowed } from "@/features/integration-webchat/lib/authorized-domain"
import { createReflinkLinkBuilder } from "@/features/reflinks/lib/reflink-links"
import { resolveWidgetBrand } from "@/features/reflinks/lib/widget-brand"
import { resolveLocale } from "@/i18n/config"
import { messagesByLocale } from "@/i18n/messages"
import { logger } from "@/lib/log"
import {
  checkGuestRateLimit,
  getGuestClientIp,
  UNKNOWN_CLIENT_IP,
} from "@/lib/rate-limit/guest-rate-limit"
import type englishMessages from "../../../../../messages/en.json"

type RouteContext = { params: Promise<{ reflinkId: string }> }

// `no-store` on purpose: saved widget settings must apply on the very next
// page view.
const corsHeaders = (origin: string | null) => {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin, Accept-Language",
  })
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin)
  }
  return headers
}

const emptyResponse = (status: number, origin: string | null) =>
  new NextResponse(null, { status, headers: corsHeaders(origin) })

/**
 * The visitor's language, from the first `Accept-Language` entry — the widget
 * runs on a third-party site, so there is no signed-in user locale to use.
 */
const getVisitorTranslator = (req: NextRequest) => {
  const [firstLanguage] = (req.headers.get("accept-language") ?? "").split(",")
  const locale = resolveLocale(firstLanguage?.split(";")[0])
  // Every locale file mirrors the English keys; the typed shape is what lets
  // `t()` check its key.
  const messages = messagesByLocale[locale] as typeof englishMessages
  return createTranslator({ locale, messages })
}

/**
 * Rate limited per visitor IP. Without a proxy header every visitor shares
 * the `unknown` bucket, which would 429 the widget for a whole busy site —
 * this route is read-only, so it skips the limit instead.
 */
const isRateLimited = async (req: NextRequest, reflinkId: string) => {
  const clientIp = getGuestClientIp(req.headers)
  if (clientIp === UNKNOWN_CLIENT_IP) {
    return null
  }
  const rateLimit = await checkGuestRateLimit({
    webchatId: `reflink-widget:${reflinkId}`,
    clientIp,
  })
  return rateLimit.limited ? rateLimit : null
}

export function OPTIONS(req: NextRequest) {
  return emptyResponse(204, req.headers.get("origin"))
}

export async function GET(req: NextRequest, context: RouteContext) {
  const origin = req.headers.get("origin")
  const parsedId = zodBigintAsString().safeParse(
    (await context.params).reflinkId,
  )
  if (!parsedId.success) {
    return emptyResponse(404, origin)
  }
  const reflinkId = parsedId.data

  try {
    const rateLimit = await isRateLimited(req, reflinkId)
    if (rateLimit) {
      const headers = corsHeaders(origin)
      headers.set("Retry-After", String(rateLimit.retryAfter))
      return new NextResponse(null, { status: 429, headers })
    }

    const reflink = await reflinkService.findForWidget(reflinkId)
    if (!reflink) {
      return emptyResponse(404, origin)
    }
    // The browser always sends `Origin` on the widget's cross-origin fetch, so
    // a missing one is a direct request — allowed, since the links it reveals
    // are public chat links anyway.
    if (!isEmbedOriginAllowed(origin, reflink.widgetAuthorizedDomains)) {
      return emptyResponse(403, null)
    }

    const { tenant, buildLinks } = await createReflinkLinkBuilder(
      reflink.workspaceId,
    )
    const hiddenInboxIds = new Set(reflink.widgetHiddenInboxIds)
    const channels = buildLinks(reflink.name)
      .filter((link) => !hiddenInboxIds.has(link.inboxId))
      .map((link) => ({
        channel: link.channel,
        name: link.inboxName,
        url: link.url,
      }))
    const t = getVisitorTranslator(req)

    return NextResponse.json(
      {
        channels,
        brand: {
          ...resolveWidgetBrand(
            {
              widgetLogoPath: reflink.widgetLogoFile?.path ?? null,
              widgetBrandName: reflink.widgetBrandName,
              widgetBrandUrl: reflink.widgetBrandUrl,
            },
            tenant,
          ),
          poweredByLabel: t("reflinks.chatWidget.poweredBy"),
          toggleLabel: t("reflinks.chatWidget.toggleLabel"),
        },
      },
      { headers: corsHeaders(origin) },
    )
  } catch (error) {
    logger.error({ err: error, reflinkId }, "Failed to load reflink widget")
    return emptyResponse(500, origin)
  }
}
