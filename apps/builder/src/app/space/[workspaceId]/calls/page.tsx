import { isCallHistoryAdmin } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { CallsPageClient } from "@/features/whatsapp-calls/calls-page-client"
import { listCallFilterOptions } from "@/features/whatsapp-calls/queries/list-call-filter-options.query"
import { listWhatsappCalls } from "@/features/whatsapp-calls/queries/list-whatsapp-calls.query"
import { listWhatsappCallsSearchParamsCache } from "@/features/whatsapp-calls/schema/query"
import {
  hasContactsAccess,
  hasWorkspacePermission,
} from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

type CallsPageProps = {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}

/**
 * P5 item 6 (plan D4) — the Calls page. Server component: resolves the
 * caller's member row (permissions gate the page AND scope the list — see
 * `whatsappCallHistoryService.list`), reads the `activity` filter from the
 * URL via `nuqs`, and renders the first page. Subsequent pages are fetched
 * client-side (`CallsPageClient`, "Load more" — plan §5's documented
 * deviation from numbered pages, chosen to avoid an unbounded COUNT(*) per view).
 */
export default async function CallsPage({
  params,
  searchParams,
}: CallsPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }
  const { permissions } = userAndWorkspace.targetWorkspaceMember

  // D4 page access: `hasContactsAccess || analytics` — mirrors
  // `requireCallHistoryAccess` (the action-layer equivalent for
  // `listWhatsappCallsAction`).
  if (
    !(
      hasContactsAccess(permissions) ||
      hasWorkspacePermission(permissions, "analytics")
    )
  ) {
    return notFound()
  }

  const { activity, inboxId, agentUserId } =
    listWhatsappCallsSearchParamsCache.parse(await searchParams)
  const t = await getTranslations("whatsapp.calls.page")

  // D4: the agent filter is admin-only — the same rule that lets `history`
  // scope see every call (`isCallHistoryAdmin`, `@chatbotx.io/business`).
  const showAgentFilter = isCallHistoryAdmin(permissions)
  // B-L1 (Fable review): a non-admin's `?agentUserId=…` (stale link,
  // tampered param) must be dropped for BOTH the service call and the
  // client props — otherwise the service silently ignores it (D4) while
  // `CallsPageClient`'s `hasActiveFilter`/"Load more" would still treat it
  // as an active filter the non-admin can never actually see reflected.
  const scopedAgentUserId = showAgentFilter
    ? (agentUserId ?? undefined)
    : undefined

  const [{ data, nextCursor }, { inboxOptions, agentOptions }] =
    await Promise.all([
      listWhatsappCalls(
        {
          workspaceId,
          activity: activity ?? undefined,
          inboxId: inboxId ?? undefined,
          agentUserId: scopedAgentUserId,
        },
        { userId: userAndWorkspace.user.id, permissions },
      ),
      listCallFilterOptions({
        workspaceId,
        includeAgents: showAgentFilter,
      }),
    ])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-semibold text-xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <CallsPageClient
        activity={activity ?? undefined}
        agentOptions={agentOptions}
        agentUserId={scopedAgentUserId}
        inboxId={inboxId ?? undefined}
        inboxOptions={inboxOptions}
        initialData={data}
        initialNextCursor={nextCursor}
        // M1 + item 6 gap closure: keyed by EVERY filter (activity, inbox,
        // agent), not just activity — any filter change REMOUNTS the client
        // component, so its internal `rows`/`nextCursor` state resets to the
        // fresh server-rendered first page instead of appending onto rows
        // left over from the previous filter combination.
        key={`${activity ?? "all"}:${inboxId ?? "all"}:${scopedAgentUserId ?? "all"}`}
        showAgentFilter={showAgentFilter}
        workspaceId={workspaceId}
      />
    </div>
  )
}
