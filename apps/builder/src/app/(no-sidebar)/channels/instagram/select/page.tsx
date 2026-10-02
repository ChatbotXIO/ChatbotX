import { redirect } from "next/navigation"
import { resolveSelectSession } from "@/features/channel-connect/lib/select-page"
import { SelectAccount } from "@/features/integration-instagram/components/select-accounts"

export const dynamic = "force-dynamic"

/**
 * `session.targets` always has exactly one entry for the direct-login
 * provider (its `exchangeCode` returns the final per-account auth directly,
 * with no `listCandidates` step) — no live `getInstagramAccount` re-fetch.
 */
export default async function InstagramSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { sessionId, resolved } = await resolveSelectSession({
    searchParams,
    credentialType: "instagram",
    brandingChannel: "instagram",
  })

  const target = resolved.session.targets[0]
  if (!target) {
    redirect("/channels/create")
  }

  return (
    <SelectAccount
      account={{
        id: target.id,
        name: target.name,
        avatarUrl: target.avatarUrl,
      }}
      sessionId={sessionId}
      workspaceId={resolved.workspace.id}
    />
  )
}
