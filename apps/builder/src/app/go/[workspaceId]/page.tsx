import { resolveOpenLinkDestination } from "@chatbotx.io/business/open-link"
import {
  buildAppLinkTargets,
  matchDeepLinkApp,
  resolveDeepLinkNavigation,
} from "@chatbotx.io/flow-config"
import { getIdFromParams } from "@chatbotx.io/utils"
import type { Metadata } from "next"
import type { SearchParams } from "next/dist/server/request/search-params"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { PublicMessage } from "@/components/public-message"
import { AppLinksMeta } from "@/features/open-link/components/app-links-meta"
import { OpenLinkButton } from "@/features/open-link/components/open-link-button"
import { OpenLinkRedirect } from "@/features/open-link/components/open-link-redirect"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

// node:crypto verifies the destination signature, and the workspace's servable
// state has to be read per request.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type OpenLinkPageProps = {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("openLink")
  // Never indexed: these URLs are per-destination and exist only to be tapped
  // from a conversation.
  return { title: t("title"), robots: { index: false, follow: false } }
}

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Interstitial that stands between a flow button and its destination.
 *
 * Meta's in-app webview cannot follow the custom-scheme handoff that links like
 * `https://zalo.me/g/<id>` depend on, so the contact would see a blank page.
 * This page carries App Links meta tags for destinations we recognise, which
 * makes Messenger launch the native app and skip the webview entirely; when
 * that does not happen it still renders one tappable button. Every other
 * destination is simply redirected, so the detour costs one hop and nothing
 * else.
 */
export default async function OpenLinkPage(props: OpenLinkPageProps) {
  const resolvedParams = await props.params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const { servable } = await loadServableWorkspace(workspaceId)
  if (!servable) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const destination = resolveOpenLinkDestination({
    workspaceId,
    u: getParam(searchParams.u),
    s: getParam(searchParams.s),
  })

  // A forged or tampered destination is shown as an error, never redirected to:
  // redirecting on an unverified URL is exactly what makes a page an open
  // redirect.
  if (!destination) {
    const t = await getTranslations("openLink")
    return (
      <PublicMessage
        description={t("invalidDescription")}
        title={t("invalidTitle")}
      />
    )
  }

  const app = matchDeepLinkApp(destination)
  if (!app) {
    return redirect(destination)
  }

  const targets = buildAppLinkTargets(destination, app)
  // Resolved here rather than in the browser so the redirect below can fire as
  // the document is parsed — a client-side check would first have to wait for
  // the JS bundle, and the button would be on screen by then.
  const requestHeaders = await headers()
  const userAgent = requestHeaders.get("user-agent") ?? ""
  const { href, auto } = resolveDeepLinkNavigation(targets, userAgent)

  return (
    <>
      <AppLinksMeta
        appName={app.appName}
        // The public URL of this very request, set by `attachProxyUrl`. It must
        // never be the destination — see `AppLinksMeta`.
        pageUrl={requestHeaders.get("x-url") ?? undefined}
        targets={targets}
      />
      {auto ? <OpenLinkRedirect destination={href} /> : null}
      <OpenLinkButton appId={app.id} href={href} />
    </>
  )
}
