import type { ConnectSessionTarget } from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"
import { AhachatImportAvailability } from "@/features/channel-connect/lib/ahachat-import-availability"
import {
  resolveSelectSession,
  toConnectPickerItem,
  type UnavailableReasonLabels,
} from "@/features/channel-connect/lib/select-page"
import { findConnectPagesOnAhachat } from "@/features/contact-sync/lib/access"
import { SelectPage } from "@/features/integration-messenger/components/select-account"

export const dynamic = "force-dynamic"

/**
 * `session.targets` is the fully computed list `ConnectionService
 * .listAndAttachCandidates` built at authorization time — there is no live
 * `getUserPages` re-fetch here. Every page Facebook returned is a row: a
 * page the user can connect, a page that cannot be connected (it carries a
 * machine `disabledReason`, translated below), or a page already connected.
 * Rows are ranked in that order: selectable 0, unavailable 1, already
 * connected 2.
 */
const rankOf = (target: ConnectSessionTarget): number => {
  if (target.selectable) {
    return 0
  }
  return target.alreadyConnected ? 2 : 1
}

export default async function MessengerSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; connect_error?: string }>
}) {
  const [{ sessionId, resolved }, t] = await Promise.all([
    resolveSelectSession({
      searchParams,
      expectedProvider: "messenger",
      noCandidatesError: "noPages",
    }),
    getTranslations(),
  ])

  const unavailableLabels: UnavailableReasonLabels = {
    byReason: {
      insufficientPermissions: t(
        "messenger.selectPage.unavailableInsufficientPermissions",
      ),
      missingAccessToken: t(
        "messenger.selectPage.unavailableMissingAccessToken",
      ),
    },
    fallback: t("messenger.selectPage.unavailableGeneric"),
  }

  const items = [...resolved.session.targets]
    .sort((current, next) => rankOf(current) - rankOf(next))
    .map((target) =>
      toConnectPickerItem({
        target,
        channel: "messenger",
        alreadyConnectedLabel: t("messenger.selectPage.alreadyConnectedNote"),
        unavailableLabels,
      }),
    )

  return (
    <AhachatImportAvailability
      pageIds={
        await findConnectPagesOnAhachat({
          workspaceId: resolved.workspace.id,
          channel: "messenger",
          pageIds: resolved.session.targets
            .filter((target) => target.selectable)
            .map((target) => target.id),
        })
      }
    >
      <SelectPage
        items={items}
        sessionId={sessionId}
        workspaceId={resolved.workspace.id}
      />
    </AhachatImportAvailability>
  )
}
