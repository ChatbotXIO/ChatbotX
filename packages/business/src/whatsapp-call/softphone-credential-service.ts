import { userSoftphoneCredentialRepository } from "@chatbotx.io/database/repositories"
import { encryptUtils } from "@chatbotx.io/encryption"
import { type FreeswitchNodes, resolveFreeswitchNode } from "./freeswitch-nodes"

const CREDENTIAL_TTL_MS = 8 * 60 * 60 * 1000
const TURN_CREDENTIAL_TTL_SECONDS = 60 * 60

const sipUsername = (workspaceId: string, userId: string): string =>
  `ag-${workspaceId}-${userId}`

// Web Crypto only (`globalThis.crypto`), never `node:crypto` — this package
// must stay reachable from an Edge Runtime bundle (see
// `__tests__/edge-safe-import-graph.test.ts`), same discipline as
// `@chatbotx.io/encryption`'s `encryptUtils`.

const bytesToBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64url")

const generateSipPassword = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return bytesToBase64Url(bytes)
}

/**
 * coturn `use-auth-secret` time-limited REST credentials: username is
 * `<unix-expiry>:<userid>`, password is
 * base64(HMAC-SHA1(secret, username)) — the documented coturn REST API
 * scheme.
 */
const mintTurnCredential = async (input: {
  secret: string
  userId: string
}): Promise<{ username: string; credential: string }> => {
  const expiry = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS
  const username = `${expiry}:${input.userId}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(username),
  )
  const credential = Buffer.from(new Uint8Array(signature)).toString("base64")
  return { username, credential }
}

export type IssuedSoftphoneCredentials = {
  sipUsername: string
  password: string
  sipDomain: string
  wssUrl: string
  turn: { urls: string; username: string; credential: string }
}

class SoftphoneCredentialService {
  /**
   * Mints/rotates the (workspace, user) softphone credential:
   * an 8h SIP digest password (encrypted at rest — FreeSWITCH digest needs
   * the clear-text value to challenge the softphone) plus a TURN
   * short-lived credential for the workspace's pinned node.
   */
  async issueCredentials(input: {
    workspaceId: string
    userId: string
    nodes: FreeswitchNodes
    nodeId: string
    turnStaticSecret: string
  }): Promise<IssuedSoftphoneCredentials> {
    const node = resolveFreeswitchNode(input.nodes, input.nodeId)
    const username = sipUsername(input.workspaceId, input.userId)
    const password = generateSipPassword()

    await userSoftphoneCredentialRepository.upsertForUser({
      workspaceId: input.workspaceId,
      userId: input.userId,
      sipUsername: username,
      passwordEncrypted: await encryptUtils.encryptText(password),
      expiresAt: new Date(Date.now() + CREDENTIAL_TTL_MS),
    })

    const turn = await mintTurnCredential({
      secret: input.turnStaticSecret,
      userId: input.userId,
    })

    return {
      sipUsername: username,
      password,
      sipDomain: node.sipDomain,
      wssUrl: node.wssUrl,
      turn: {
        urls: node.turnUrl,
        username: turn.username,
        credential: turn.credential,
      },
    }
  }

  /** Revokes a member's softphone credential (member removal, inbox access revoked). */
  async revokeCredentials(input: {
    workspaceId: string
    userId: string
  }): Promise<void> {
    await userSoftphoneCredentialRepository.revoke(input)
  }
}

export const softphoneCredentialService = new SoftphoneCredentialService()
