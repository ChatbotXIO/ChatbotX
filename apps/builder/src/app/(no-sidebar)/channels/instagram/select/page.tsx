import { redirect } from "next/navigation"
import { AhachatImportAvailability } from "@/features/channel-connect/lib/ahachat-import-availability"
import { resolveSelectSession } from "@/features/channel-connect/lib/select-page"
import { findConnectPagesOnAhachat } from "@/features/contact-sync/lib/access"
import { SelectAccount } from "@/features/integration-instagram/components/select-accounts"
import { createChannelPath } from "@/lib/workspace/create-first-workspace"

export const dynamic = "force-dynamic"

/**
 * `session.targets` always has exactly one entry for the direct-login
 * provider (its `exchangeCode` returns the final per-account auth directly,
 * with no `listCandidates` step) — no live `getInstagramAccount` re-fetch.
 */
export default async function InstagramSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; connect_error?: string }>
}) {
  const { sessionId, resolved } = await resolveSelectSession({
    searchParams,
    expectedProvider: "instagram",
    noCandidatesError: "noInstagramAccounts",
  })

  const target = resolved.session.targets[0]
  if (!target) {
    redirect(createChannelPath({ workspaceId: resolved.workspace.id }))
  }

  return (
    <AhachatImportAvailability
      pageIds={
        await findConnectPagesOnAhachat({
          workspaceId: resolved.workspace.id,
          channel: "instagram",
          pageIds: target.selectable ? [target.id] : [],
        })
      }
    >
      <SelectAccount
        account={{
          id: target.id,
          name: target.name,
          avatarUrl: target.avatarUrl,
        }}
        sessionId={sessionId}
        workspaceId={resolved.workspace.id}
      />
    </AhachatImportAvailability>
  )
}
