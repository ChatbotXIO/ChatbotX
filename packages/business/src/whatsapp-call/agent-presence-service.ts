import { agentSipPresenceRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"

/** `ag-<workspaceId>-<userId>` — minted by `softphoneCredentialService.issueCredentials`. */
const AGENT_SIP_USERNAME_RE = /^ag-(\d+)-(\d+)$/

export type ParsedAgentSipUsername = { workspaceId: string; userId: string }

/** Thrown by {@link parseAgentSipUsername} for a username outside the `ag-<ws>-<u>` shape. */
export class InvalidAgentSipUsernameError extends Error {
  constructor(username: string) {
    super(`invalid-agent-sip-username: "${username}"`)
    this.name = "InvalidAgentSipUsernameError"
  }
}

/**
 * One shared parser for the `ag-<workspaceId>-<userId>` SIP username
 * — used by presence handling here
 * AND by the xml_curl directory renderer's regex-first validation.
 */
export const parseAgentSipUsername = (
  username: string,
): ParsedAgentSipUsername => {
  const match = AGENT_SIP_USERNAME_RE.exec(username)
  if (!match) {
    throw new InvalidAgentSipUsernameError(username)
  }
  return { workspaceId: match[1], userId: match[2] }
}

export const registrationEventKinds = z.enum([
  "register",
  "unregister",
  "expire",
])
export type RegistrationEventKind = z.infer<typeof registrationEventKinds>

export type ApplyRegistrationEventInput = {
  kind: RegistrationEventKind
  username: string
  contact: string | null
  expiresAt: Date
}

/** Table-driven dispatch by registration event kind. */
const REGISTRATION_HANDLERS: Record<
  RegistrationEventKind,
  (input: ApplyRegistrationEventInput & ParsedAgentSipUsername) => Promise<void>
> = {
  register: async (input) => {
    await agentSipPresenceRepository.upsertFromRegister({
      workspaceId: input.workspaceId,
      userId: input.userId,
      contact: input.contact,
      expiresAt: input.expiresAt,
    })
  },
  unregister: async (input) => {
    await agentSipPresenceRepository.expire({
      workspaceId: input.workspaceId,
      userId: input.userId,
      at: new Date(),
    })
  },
  expire: async (input) => {
    await agentSipPresenceRepository.expire({
      workspaceId: input.workspaceId,
      userId: input.userId,
      at: new Date(),
    })
  },
}

class AgentPresenceService {
  /**
   * Applies a `sofia::register`/`unregister`/`expire` ESL event —
   * the only correctness this table needs is bounding ring fan-out
   * (FreeSWITCH itself drops a stale target at dial time).
   */
  async applyRegistrationEvent(
    input: ApplyRegistrationEventInput,
  ): Promise<void> {
    const parsed = parseAgentSipUsername(input.username)
    await REGISTRATION_HANDLERS[input.kind]({ ...input, ...parsed })
  }
}

export const agentPresenceService = new AgentPresenceService()
