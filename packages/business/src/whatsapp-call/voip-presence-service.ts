import { presenceStore } from "@chatbotx.io/redis"

/**
 * How long a single heartbeat keeps an agent "available for VoIP calls". The
 * builder pings well inside this window (see the inbox heartbeat hook), so a
 * closed tab / navigated-away agent drops out within one TTL without any
 * explicit sign-off. Must stay comfortably larger than the client's ping
 * interval so a slightly late ping never flaps presence.
 */
export const VOIP_PRESENCE_TTL_MS = 45_000

/**
 * Cap on how many agents a single inbound VoIP call fans out to — the same
 * "ring a bounded set" discipline the SIP path uses (`MAX_RING_TARGETS`), so a
 * huge workspace can't fork one call to hundreds of browsers.
 */
export const MAX_VOIP_RING_TARGETS = 10

const presenceKey = (workspaceId: string): string =>
  `voip:presence:${workspaceId}`

/**
 * VoIP-call agent presence — the routing source for browser-WebRTC calls,
 * deliberately INDEPENDENT of SIP `REGISTER` (`agentSipPresence`). A VoIP-only
 * number has no SIP registration, so reusing SIP presence would reject every
 * call; instead an agent is "present" for VoIP simply by having the inbox open
 * (the builder heartbeats while the call dock is mounted). Pure orchestration
 * over the generic `presenceStore` (Redis) — no `db`, no channel specifics.
 */
class WhatsappVoipPresenceService {
  /** Keeps the agent live for the next {@link VOIP_PRESENCE_TTL_MS}. */
  async heartbeat(input: {
    workspaceId: string
    userId: string
  }): Promise<void> {
    await presenceStore.heartbeat(
      presenceKey(input.workspaceId),
      input.userId,
      VOIP_PRESENCE_TTL_MS,
    )
  }

  /** Explicit sign-off (tab close / leaving the inbox) — presence also lapses on its own via TTL. */
  async signOff(input: { workspaceId: string; userId: string }): Promise<void> {
    await presenceStore.drop(presenceKey(input.workspaceId), input.userId)
  }

  /**
   * The live agents to ring for an inbound VoIP call in this workspace, capped
   * at {@link MAX_VOIP_RING_TARGETS}. Empty means nobody has the inbox open →
   * the caller Meta-rejects the call (the "missed" outcome).
   */
  async liveAgents(input: {
    workspaceId: string
    limit?: number
  }): Promise<string[]> {
    return await presenceStore.liveMembers(
      presenceKey(input.workspaceId),
      input.limit ?? MAX_VOIP_RING_TARGETS,
    )
  }
}

export const whatsappVoipPresenceService = new WhatsappVoipPresenceService()
