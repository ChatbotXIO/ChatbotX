import { inboxService, workspaceMemberService } from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { CallFilterOption } from "../calls-filter-bar"

export type ListCallFilterOptionsResult = {
  inboxOptions: CallFilterOption[]
  agentOptions: CallFilterOption[]
}

/**
 * Session-free read, called straight from `page.tsx`. Uses
 * `inboxService.listChannelOptionsByWorkspace` (id/name only, scoped by
 * channel) rather than `listWithIntegrationsByWorkspace`, which would
 * eager-load all nine credential-bearing integration relations per inbox
 * just to discard the non-whatsapp ones. `includeAgents` false skips the
 * workspace member read entirely for non-admin callers.
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
