import { connectSessionService } from "@chatbotx.io/business/connect-session"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ConnectSessionAutoRefresh } from "./auto-refresh"
import { resolveConnectSessionMessageKind } from "./resolve-message"

export const metadata: Metadata = {
  title: "Connecting…",
}

type ConnectSessionPageProps = {
  params: Promise<{ sessionId: string }>
}

/**
 * Neutral completion page for an OAuth `ConnectSession` started via the
 * public/private connect API (`POST /v1/connections`,
 * `POST /v1/connections/{id}/reconnect`) with no `redirectUrl` (or one that
 * failed `sanitizeOptionalReturnUrl`). No builder login is required: the
 * person completing an API/MCP-started connect is never necessarily a
 * builder user or a member of the workspace that started it — `sessionId`
 * itself is the capability token (an unguessable snowflake), matched
 * against `ConnectSessionService.findById`'s workspace-unscoped read.
 *
 * This page never lets the visitor pick a target for a multi-account
 * provider — that is the API/MCP caller's own job, via their own
 * `POST /v1/connect-sessions/{id}/targets` call once they observe
 * `awaiting_selection` through their own polling. This page only reports
 * status and auto-refreshes while the session is still in flight.
 *
 * WhatsApp's embedded-signup popup is NOT hosted here — WhatsApp's connect
 * flow creates workspaces and manages its own `WhatsappSignupSession`
 * outside the Connection domain and is out of scope for this page.
 */
export default async function ConnectSessionPage(
  props: ConnectSessionPageProps,
) {
  const { sessionId } = await props.params
  const t = await getTranslations("connectSessionPage")
  const session = await connectSessionService.findById(sessionId)
  const kind = resolveConnectSessionMessageKind(session?.status ?? null)

  return (
    <ConnectSessionMessage
      description={t(`${kind}Description`)}
      title={t(`${kind}Title`)}
    >
      {kind === "processing" && <ConnectSessionAutoRefresh />}
    </ConnectSessionMessage>
  )
}

function ConnectSessionMessage({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="max-w-sm text-center">
        <h1 className="font-semibold text-xl">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  )
}
