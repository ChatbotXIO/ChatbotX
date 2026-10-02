import { redirect } from "next/navigation"
import {
  type ResolvedConnectSession,
  resolveConnectSession,
} from "@/features/channel-connect/lib/resolve-connect-session"
import { SelectAccount } from "@/features/integration-instagram/components/select-accounts"
import { getCurrentUserId } from "@/lib/auth/utils"
import { logger } from "@/lib/log"

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
  const { session: sessionId } = await searchParams
  if (!sessionId) {
    redirect("/channels/create")
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect("/channels/create")
  }

  let resolved: ResolvedConnectSession<"instagram">
  try {
    resolved = await resolveConnectSession({
      userId,
      sessionId,
      credentialType: "instagram",
      brandingChannel: "instagram",
    })
  } catch (err) {
    // An expired/invalid/no-longer-accessible session previously 500'd this
    // Server Component render — redirect back to the picker instead.
    logger.warn({ err, sessionId }, "resolveConnectSession failed")
    redirect("/channels/create")
  }

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
