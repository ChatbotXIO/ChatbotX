import { inboxService, workspaceMemberService } from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { CallFilterOption } from "../calls-filter-bar"

export type ListCallFilterOptionsResult = {
  inboxOptions: CallFilterOption[]
  agentOptions: CallFilterOption[]
}

/**
 * P5 item 6 gap closure (M5 deviation) — options for the Calls page's inbox
 * and agent selects. A session-free read (no `member`/permission narrowing
 * of its own — the caller already resolved that), so it is called straight
 * from `page.tsx` with no `.query.ts` request adapter needed beyond this
 * (AGENTS.md invariant #9).
 *
 * B-M1 (Fable review) fix: inboxes are narrowed to the `whatsapp` channel AT
 * THE QUERY LEVEL via `inboxService.listChannelOptionsByWorkspace` (a
 * bounded id/name read scoped by workspace + channel) — `WhatsappCall.inboxId`
 * only ever joins a WhatsApp inbox (calling is WhatsApp-only today), so
 * any other channel's
 * inbox could never appear in a filtered result. Previously used
 * `inboxService.listWithIntegrationsByWorkspace`, which eager-loads all nine
 * credential-bearing integration relations on EVERY inbox in the workspace
 * (re-run on every filter change) just to read id/name and discard
 * everything non-whatsapp in memory.
 *
 * `includeAgents` is false for a non-admin caller (D4: the agent filter is
 * admin-only) — skips the workspace member read entirely instead of
 * fetching a list the caller's own `CallsFilterBar` won't render.
 */
export async function listCallFilterOptions(input: {
  workspaceId: string
  includeAgents: boolean
}): Promise<ListCallFilterOptionsResult> {
  const [inboxOptions, members] = await Promise.all([
    inboxService.listChannelOptionsByWorkspace({
      workspaceId: input.workspaceId,
      channel: channelTypes.enum.whatsapp,
    }),
    input.includeAgents
      ? workspaceMemberService.listByWorkspaceId({
          workspaceId: input.workspaceId,
        })
      : Promise.resolve([]),
  ])

  return {
    inboxOptions,
    agentOptions: members.map((member) => ({
      id: member.user.id,
      name: member.user.name ?? member.user.email,
    })),
  }
}
