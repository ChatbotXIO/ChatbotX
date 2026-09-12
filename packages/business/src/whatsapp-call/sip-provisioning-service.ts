import type { SipProvisioningStatus } from "@chatbotx.io/database/partials"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import { createId } from "@chatbotx.io/utils"
import { freeswitchApiClient } from "./freeswitch-api-client"
import { pinWorkspaceToNode } from "./sip-node-allocator"

const LEASE_DURATION_MS = 5 * 60 * 1000
const SOFIA_PROFILE = "whatsapp"

/**
 * State machine: the only edges
 * `assertSipProvisioningTransition` allows. `none`/`failed` both re-enter
 * `provisioning` (a fresh claim); `provisioning` only ever leaves toward its
 * two terminal outcomes for that attempt.
 */
export const SIP_PROVISIONING_TRANSITIONS: Record<
  SipProvisioningStatus,
  readonly SipProvisioningStatus[]
> = {
  none: ["provisioning"],
  provisioning: ["provisioned", "failed"],
  provisioned: ["enabled", "failed", "none"],
  // `enabled -> provisioned` is the disable path, run in reverse order:
  // Meta `sip.status: DISABLED` first, then back to provisioned.
  enabled: ["provisioned", "none", "failed"],
  failed: ["provisioning"],
}

export class SipProvisioningTransitionError extends Error {
  constructor(from: SipProvisioningStatus, to: SipProvisioningStatus) {
    super(`invalid-sip-provisioning-transition: ${from} -> ${to}`)
    this.name = "SipProvisioningTransitionError"
  }
}

export const assertSipProvisioningTransition = (
  from: SipProvisioningStatus,
  to: SipProvisioningStatus,
): void => {
  if (!SIP_PROVISIONING_TRANSITIONS[from].includes(to)) {
    throw new SipProvisioningTransitionError(from, to)
  }
}

/** Thrown when a claim attempt loses the race (another worker/lease already holds it). */
export class SipProvisioningClaimUnavailableError extends Error {
  constructor(integrationId: string) {
    super(
      `sip-provisioning-claim-unavailable: integration ${integrationId} is already being provisioned`,
    )
    this.name = "SipProvisioningClaimUnavailableError"
  }
}

/** Thrown when Meta's settings response has no SIP digest password to store. */
export class SipProvisioningMissingCredentialsError extends Error {
  constructor(integrationId: string) {
    super(
      `sip-provisioning-missing-credentials: Meta returned no sip_user_password for integration ${integrationId}`,
    )
    this.name = "SipProvisioningMissingCredentialsError"
  }
}

/** Thrown when the FreeSWITCH gateway never reaches a usable state after rescan. */
export class SipProvisioningGatewayError extends Error {
  constructor(integrationId: string, detail: string) {
    super(
      `sip-provisioning-gateway-error: integration ${integrationId}: ${detail}`,
    )
    this.name = "SipProvisioningGatewayError"
  }
}

const sipGatewayName = (integrationId: string): string => `wa-${integrationId}`

type ProvisionInput = {
  workspaceId: string
  integrationId: string
  /** Node ids eligible for the least-loaded pin. */
  nodeIds: readonly string[]
  /**
   * Fetches Meta's SIP digest password for this number
   * (`GET /{pnid}/settings?include_sip_credentials=true`). Injected rather
   * than imported from `@chatbotx.io/integration-whatsapp` because that
   * package already depends on `@chatbotx.io/business` — importing it here
   * would create a workspace dependency cycle. The caller (a worker/builder
   * action, which already depends on both) passes
   * `integrations/whatsapp/src/api/calling.ts`'s `getCallingSettings` bound
   * to the row's stored `auth`.
   */
  fetchSipPassword: (
    row: IntegrationWhatsappModel,
  ) => Promise<string | undefined>
}

/**
 * Marks the row `failed` with the given detail, WITHOUT throwing itself, so
 * `provision`'s catch block can record the failure and still propagate the
 * original error. Reuses the same `claim` that started this attempt — the
 * repository's `updateSipProvisioning` is claim-scoped, so a claim that was
 * already stolen by a new attempt (lease expiry) silently no-ops here rather
 * than clobbering the new attempt's state.
 */
const markFailed = async (input: {
  workspaceId: string
  integrationId: string
  claim: string
  detail: string
}): Promise<void> => {
  await integrationWhatsappRepository.updateSipProvisioning({
    id: input.integrationId,
    workspaceId: input.workspaceId,
    claim: input.claim,
    values: {
      sipProvisioningStatus: "failed",
      sipLastError: input.detail,
    },
  })
}

class SipProvisioningService {
  /**
   * Provisions one WhatsApp number for FreeSWITCH calling:
   * claim the lease → pin the workspace to a node → fetch Meta's SIP digest
   * password → encrypt + store it → rescan the `whatsapp` sofia profile →
   * verify the gateway came up → `provisioned`. Idempotent re-entry: a
   * caller retrying after a crash re-claims the same (expired) lease and
   * runs the same steps again.
   */
  async provision(input: ProvisionInput): Promise<IntegrationWhatsappModel> {
    const claim = createId()
    const claimed = await integrationWhatsappRepository.claimSipProvisioning({
      id: input.integrationId,
      workspaceId: input.workspaceId,
      claim,
      leaseUntil: new Date(Date.now() + LEASE_DURATION_MS),
    })
    if (!claimed) {
      throw new SipProvisioningClaimUnavailableError(input.integrationId)
    }
    assertSipProvisioningTransition(
      claimed.sipProvisioningStatus as SipProvisioningStatus,
      "provisioned",
    )

    try {
      const pin = await pinWorkspaceToNode({
        workspaceId: input.workspaceId,
        nodeIds: input.nodeIds,
      })

      const password = await input.fetchSipPassword(claimed)
      if (!password) {
        throw new SipProvisioningMissingCredentialsError(input.integrationId)
      }

      const sipPasswordEncrypted = await encryptUtils.encryptText(password)
      const gatewayName = sipGatewayName(input.integrationId)

      await integrationWhatsappRepository.updateSipProvisioning({
        id: input.integrationId,
        workspaceId: input.workspaceId,
        claim,
        values: {
          sipPasswordEncrypted,
          sipGatewayName: gatewayName,
          sipNodeId: pin.nodeId,
        },
      })

      await freeswitchApiClient.run(pin.nodeId, {
        kind: "sofiaProfileRescan",
        profile: SOFIA_PROFILE,
      })

      const status = await freeswitchApiClient.run(pin.nodeId, {
        kind: "sofiaGatewayStatus",
        gateway: gatewayName,
      })
      if (!status.reply.includes(gatewayName)) {
        throw new SipProvisioningGatewayError(
          input.integrationId,
          `gateway not found after rescan: ${status.reply}`,
        )
      }

      const provisioned =
        await integrationWhatsappRepository.updateSipProvisioning({
          id: input.integrationId,
          workspaceId: input.workspaceId,
          claim,
          values: {
            sipProvisioningStatus: "provisioned",
            sipProvisionedAt: new Date(),
            sipLastError: null,
          },
        })
      if (!provisioned) {
        throw new SipProvisioningClaimUnavailableError(input.integrationId)
      }
      return provisioned
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      await markFailed({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        claim,
        detail,
      })
      throw error
    }
  }

  /**
   * Reverses provisioning (rollback + disable path): kills only
   * this integration's own gateway (never another number's) and clears the
   * stored credentials. Re-uses the row's existing provisioning claim as the
   * ownership token for `updateSipProvisioning` — a fresh `provision()` call
   * always re-claims first, so this never fights a concurrent attempt.
   */
  async deprovision(input: {
    workspaceId: string
    integrationId: string
    /**
     * Turns Meta's SIP routing off for this number (`sip.status: DISABLED`)
     * — injected by the caller (the WhatsApp API package cannot be imported
     * here). Required when the integration is still `enabled`: Meta must
     * stop sending INVITEs BEFORE the gateway is killed, otherwise inbound
     * calls would route into a gateway that no longer exists.
     */
    disableMetaSip?: (row: IntegrationWhatsappModel) => Promise<void>
  }): Promise<IntegrationWhatsappModel | null> {
    let current = await integrationWhatsappRepository.findByIdForWorkspace({
      id: input.integrationId,
      workspaceId: input.workspaceId,
    })
    if (!current) {
      return null
    }
    if (current.sipProvisioningStatus === "none") {
      return current
    }
    if (current.sipProvisioningStatus === "enabled") {
      if (!input.disableMetaSip) {
        throw new SipProvisioningTransitionError("enabled", "none")
      }
      await input.disableMetaSip(current)
      await integrationWhatsappRepository.updateSipProvisioning({
        id: input.integrationId,
        workspaceId: input.workspaceId,
        claim: current.sipProvisioningClaim ?? "",
        values: { sipProvisioningStatus: "provisioned" },
      })
      // Meta no longer routes to us; continue the teardown from
      // `provisioned` with the gateway/node info of the row we started with.
      current = { ...current, sipProvisioningStatus: "provisioned" }
    }
    assertSipProvisioningTransition(
      current.sipProvisioningStatus as SipProvisioningStatus,
      "none",
    )

    if (current.sipGatewayName && current.sipNodeId) {
      await freeswitchApiClient.run(current.sipNodeId, {
        kind: "sofiaGatewayKill",
        profile: SOFIA_PROFILE,
        gateway: current.sipGatewayName,
      })
    }

    return await integrationWhatsappRepository.updateSipProvisioning({
      id: input.integrationId,
      workspaceId: input.workspaceId,
      claim: current.sipProvisioningClaim ?? "",
      values: {
        sipProvisioningStatus: "none",
        sipPasswordEncrypted: null,
        sipGatewayName: null,
        sipProvisionedAt: null,
        sipLastError: null,
      },
    })
  }
}

export const sipProvisioningService = new SipProvisioningService()
