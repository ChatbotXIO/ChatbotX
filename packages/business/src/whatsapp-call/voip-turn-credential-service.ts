import { mintTurnCredential } from "./turn-credential"

/**
 * Browser WebRTC ICE credentials live only for the answer window plus a
 * short buffer, since a fresh set is minted per call via
 * `getWhatsappVoipTurnCredentialsAction` rather than cached client-side.
 */
export const VOIP_TURN_CREDENTIAL_TTL_SECONDS = 10 * 60

/**
 * Public STUN fallback used when no TURN server is configured (local dev)
 * — good enough for same-network/NAT-friendly testing, never sufficient in
 * production behind hostile NATs (see `docs/whatsapp-calling-voip.md`
 * "Required infrastructure").
 */
const PUBLIC_STUN_URL = "stun:stun.l.google.com:19302"

export type VoipIceServer = {
  urls: string
  username?: string
  credential?: string
}

export type VoipTurnCredentials = {
  iceServers: VoipIceServer[]
  /**
   * `false` when no coturn TURN secret/URL is configured on this
   * deployment — the UI can still proceed (STUN-only works on
   * NAT-friendly networks) but should surface that TURN is required for
   * production reliability.
   */
  turnConfigured: boolean
}

export type IssueVoipTurnCredentialsInput = {
  /** The reserved agent this credential is scoped to. */
  userId: string
  /** The call this credential is scoped to — never reusable across calls. */
  wacid: string
  turnUrl?: string
  turnStaticSecret?: string
  stunUrl?: string
}

class VoipTurnCredentialService {
  /**
   * Short-lived coturn REST credentials (reuses `mintTurnCredential`'s HMAC
   * scheme), labelled `<userId>:<wacid>`. The label is for log attribution
   * only — coturn verifies the HMAC and the expiry and nothing else, so a
   * leaked credential works for any call, from anywhere, until it expires.
   * The TTL is what bounds it. STUN is always included; TURN is added only when the
   * deployment has a TURN URL + static secret configured — otherwise
   * `turnConfigured:false` tells the caller to fall back to STUN-only.
   */
  async issueCredentials(
    input: IssueVoipTurnCredentialsInput,
  ): Promise<VoipTurnCredentials> {
    const stunUrl = input.stunUrl ?? PUBLIC_STUN_URL
    const iceServers: VoipIceServer[] = [{ urls: stunUrl }]

    if (!(input.turnUrl && input.turnStaticSecret)) {
      return { iceServers, turnConfigured: false }
    }

    const turn = await mintTurnCredential({
      secret: input.turnStaticSecret,
      userId: `${input.userId}:${input.wacid}`,
      ttlSeconds: VOIP_TURN_CREDENTIAL_TTL_SECONDS,
    })

    iceServers.push({
      urls: input.turnUrl,
      username: turn.username,
      credential: turn.credential,
    })

    return { iceServers, turnConfigured: true }
  }
}

export const voipTurnCredentialService = new VoipTurnCredentialService()
