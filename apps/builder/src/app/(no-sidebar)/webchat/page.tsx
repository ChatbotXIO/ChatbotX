import {
  integrationWebchatService,
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { ensureBrandingMenuEntry } from "@chatbotx.io/business/branding"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type { SearchParams } from "next/dist/server/request/search-params"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import z from "zod"
import { isCommunity } from "@/env"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import {
  isFirstPartyOrigin,
  isOriginAuthorized,
  resolveEmbeddingOrigin,
} from "@/features/integration-webchat/lib/authorized-domain"
import { createGuestConversationId } from "@/features/integration-webchat/lib/guest-conversation-id"
import { createWebchatAccessToken } from "@/features/integration-webchat/lib/webchat-access-token"
import { CustomWidgetStyle } from "@/features/integration-webchat/lib/widget-css"
import { GuestSessionStoreProvider } from "@/features/integration-webchat/providers/store/guest-session-provider"
import { toWebchatClientConfig } from "@/features/integration-webchat/providers/store/lib/webchat-client-config"
import { WebchatWrapper } from "@/features/integration-webchat/webchat-wrapper"
import { getTenantSettings } from "@/features/tenant/utils"
import { getWorkspaceLogoUrl } from "@/features/workspaces/helpers"
import { getDomainFromHeader } from "@/lib/domain"

type WebchatPageProps = {
  searchParams: Promise<SearchParams>
}

export const dynamic = "force-dynamic"

export default async function WebchatPage(props: WebchatPageProps) {
  const searchParams = await props.searchParams

  const { data } = z
    .object({
      workspaceId: zodBigintAsString(),
      webchatId: zodBigintAsString(),
      ref: z.string().optional(),
      domain: z.string().optional(),
      parentOrigin: z.string().optional(),
      guestConversationId: z.string().optional(),
    })
    .safeParse(searchParams)
  if (!data) {
    return notFound()
  }

  const targetWebchat =
    await integrationWebchatService.findByIdForWorkspaceOrNull({
      id: data.webchatId,
      workspaceId: data.workspaceId,
    })

  if (!targetWebchat) {
    return notFound()
  }

  const workspace = await workspaceService.find({
    where: { id: data.workspaceId },
  })
  if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
    const t = await getTranslations("webchat")

    return (
      <main className="flex h-screen w-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-2">
          <p className="text-muted-foreground text-sm">
            {t("chatUnavailable")}
          </p>
        </div>
      </main>
    )
  }

  const requestHeaders = await headers()
  const embeddingOrigin = requestHeaders.get("referer")
  const appHost = await getDomainFromHeader()
  const hasFirstPartyReferer =
    !!embeddingOrigin && isFirstPartyOrigin(embeddingOrigin, appHost)
  // A `referrerpolicy="no-referrer"` iframe has no Referer, which would pass
  // as a direct open and skip the allowlist. Browsers still label iframe
  // navigations with `Sec-Fetch-Dest: iframe`, so a restricted webchat
  // refuses a referer-less iframe load.
  const isRefererlessIframe =
    !embeddingOrigin &&
    requestHeaders.get("sec-fetch-dest") === "iframe" &&
    targetWebchat.authorizedDomains.length > 0
  if (
    isRefererlessIframe ||
    !(
      isFirstPartyOrigin(embeddingOrigin, appHost) ||
      isOriginAuthorized(embeddingOrigin, targetWebchat.authorizedDomains)
    )
  ) {
    const t = await getTranslations("webchat.unauthorizedDomain")

    return (
      <main className="flex h-screen w-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="font-semibold text-lg">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
      </main>
    )
  }

  // The access token is session-scoped (workspace/webchat/origin/exp) and
  // not bound to a guestConversationId — see webchat-access-token.ts. So a
  // returning visitor's persisted id is trusted as-is whenever the client
  // presents one; only a brand-new visitor gets a freshly minted id.
  const guestConversationId =
    data.guestConversationId ??
    createGuestConversationId(targetWebchat.workspaceId)

  // Only a first-party referer can make URL origin parameters trustworthy.
  // Direct opens and third-party embeds use their referer.
  const accessTokenOrigin = hasFirstPartyReferer
    ? resolveEmbeddingOrigin({
        domain: data.domain,
        parentOrigin: data.parentOrigin,
        referer: embeddingOrigin,
      })
    : embeddingOrigin
  const accessToken = await createWebchatAccessToken({
    origin: accessTokenOrigin,
    webchatId: targetWebchat.id,
    workspaceId: targetWebchat.workspaceId,
  })

  // Gated server-side so a showLogo=false widget never even receives a URL,
  // rather than shipping one and relying on the client to hide it.
  const { storageUrl, appUrl } = await getTenantSettings()
  const workspaceLogoUrl = targetWebchat.showLogo
    ? getWorkspaceLogoUrl(workspace, storageUrl)
    : undefined

  // Community edition always shows the "Built with" branding link. Enforced
  // here on the read path so legacy rows (or rows edited via direct POSTs)
  // still render it.
  const clientConfig = toWebchatClientConfig(targetWebchat)
  const config = isCommunity()
    ? {
        ...clientConfig,
        persistentMenus: ensureBrandingMenuEntry(clientConfig.persistentMenus, {
          label: BRANDING_TITLE,
          url: getBrandingUrl("webchat", appUrl),
        }),
      }
    : clientConfig

  return (
    <GuestSessionStoreProvider
      accessToken={accessToken}
      config={config}
      serverGuestConversationId={guestConversationId}
      workspaceLogoUrl={workspaceLogoUrl}
    >
      {targetWebchat.customCss && (
        <CustomWidgetStyle css={targetWebchat.customCss} />
      )}
      <WebchatWrapper referral={data.ref} />
    </GuestSessionStoreProvider>
  )
}
