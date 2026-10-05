import { getTranslations } from "next-intl/server"
import {
  resolveSelectSession,
  toConnectPickerItem,
} from "@/features/channel-connect/lib/select-page"
import { SelectPage } from "@/features/integration-messenger/components/select-account"

export const dynamic = "force-dynamic"

/**
 * `session.targets` is already the fully-computed, admin-filtered,
 * already-connected-marked list `ConnectionService.listAndAttachCandidates`
 * built at authorization time — there is no live `getUserPages` re-fetch
 * here anymore. Messenger's `listCandidates` silently drops pages the user
 * doesn't administer before they ever become a target, so this page never
 * sees a not-admin row to warn about, and the Business Manager lookup
 * warning isn't part of the session's public target projection either —
 * both were removed along with the dead props that carried them.
 */
export default async function MessengerSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const [{ sessionId, resolved }, t] = await Promise.all([
    resolveSelectSession({ searchParams, expectedProvider: "messenger" }),
    getTranslations(),
  ])

  const items = resolved.session.targets
    .map((target) =>
      toConnectPickerItem({
        target,
        channel: "messenger",
        alreadyConnectedLabel: t("messenger.selectPage.alreadyConnectedNote"),
      }),
    )
    .sort((current, next) => Number(current.disabled) - Number(next.disabled))

  return (
    <SelectPage
      items={items}
      sessionId={sessionId}
      workspaceId={resolved.workspace.id}
    />
  )
}
