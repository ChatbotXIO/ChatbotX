import type { DatabaseClient } from "@chatbotx.io/database/client"
import { invitationRepository } from "@chatbotx.io/database/repositories"
import type {
  InvitationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import { addDays } from "date-fns"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { resolveServingHost } from "../platform/settings"
import { userService } from "../user/service"
import { workspaceService } from "../workspace/service"

/** How long a shareable invite code stays usable. */
const INVITATION_TTL_DAYS = 1

/** 16 random bytes (128 bits), base64url-encoded. */
const INVITATION_CODE_BYTES = 16

/**
 * CSPRNG invite code. A sequential id (even a snowflake) is a solved puzzle
 * for an attacker who knows roughly when the invite was issued; this is not.
 * Web Crypto + `btoa` rather than `node:crypto`, so it runs in any runtime.
 */
const generateInvitationCode = (): string =>
  btoa(
    String.fromCharCode(
      ...crypto.getRandomValues(new Uint8Array(INVITATION_CODE_BYTES)),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")

/**
 * The anonymous-visitor-safe view of an invitation, returned by the public
 * `/invitations/[code]` page. Never the raw `InvitationModel`/`WorkspaceModel`/
 * `UserModel` rows: those carry the workspace's legacy plaintext `token`
 * (the `{{api_key}}` value) and the inviter's `email`/`tenantId`.
 */
export type InvitationSummary = {
  code: string
  expiresAt: Date
  workspace: {
    name: string
    logo: string | null
    scheduledDeletionAt: Date | null
  } | null
  inviter: { name: string | null; image: string | null }
}

type InvitationLookupRejection = {
  invitationId?: string
  reason: "not_found" | "expired" | "no_workspace" | "tenant_mismatch"
  requestTenantId?: string
  servingTenantId?: string
  workspaceId?: string
}

type ActiveLookup =
  | {
      ok: true
      invitation: InvitationModel & { workspaceId: string }
      workspace: WorkspaceModel
    }
  | {
      ok: false
      reason: InvitationLookupRejection["reason"]
      log: InvitationLookupRejection
    }

class InvitationService extends BaseService {
  private isActive(
    invitation: InvitationModel,
    now: Date,
  ): invitation is InvitationModel & { workspaceId: string } {
    return Boolean(invitation.workspaceId && invitation.expiresAt >= now)
  }

  private logLookupRejection(props: InvitationLookupRejection) {
    logger.debug(props, "Invitation lookup rejected")
  }

  private async lookupActive(
    code: string,
    tenantId: string,
  ): Promise<ActiveLookup> {
    const invitation = await invitationRepository.findByCode(code)
    if (!invitation) {
      return {
        ok: false,
        reason: "not_found",
        log: { reason: "not_found" },
      }
    }

    const now = new Date()
    if (!this.isActive(invitation, now)) {
      const reason = invitation.expiresAt < now ? "expired" : "no_workspace"
      return {
        ok: false,
        reason,
        log: { invitationId: invitation.id, reason },
      }
    }

    const workspace = await workspaceService.find({
      where: { id: invitation.workspaceId },
    })
    if (!workspace) {
      return {
        ok: false,
        reason: "no_workspace",
        log: {
          invitationId: invitation.id,
          reason: "no_workspace",
          workspaceId: invitation.workspaceId,
        },
      }
    }

    const servingHost = await resolveServingHost(workspace.tenantId)
    if (servingHost.tenantId !== tenantId) {
      return {
        ok: false,
        reason: "tenant_mismatch",
        log: {
          invitationId: invitation.id,
          reason: "tenant_mismatch",
          requestTenantId: tenantId,
          servingTenantId: servingHost.tenantId,
          workspaceId: invitation.workspaceId,
        },
      }
    }

    return { ok: true, invitation, workspace }
  }

  /**
   * The invitation behind a code, or `null` when unknown, expired,
   * workspace-less, or bound to a workspace outside `tenantId` — a reseller
   * tenant's code must never resolve against another tenant's domain.
   */
  async findActiveByCode(
    code: string,
    { tenantId }: { tenantId: string },
  ): Promise<(InvitationModel & { workspaceId: string }) | null> {
    const lookup = await this.lookupActive(code, tenantId)
    if (!lookup.ok) {
      this.logLookupRejection(lookup.log)
      return null
    }
    return lookup.invitation
  }

  async findActiveByCodeOrFail(
    code: string,
    tenantId: string,
  ): Promise<InvitationModel & { workspaceId: string }> {
    const lookup = await this.lookupActive(code, tenantId)
    if (lookup.ok) {
      return lookup.invitation
    }
    if (lookup.reason === "expired") {
      throw new ChatbotXException("Invitation expired")
    }
    if (lookup.reason === "no_workspace" && !lookup.log.workspaceId) {
      throw new ChatbotXException("Invalid invitation: no workspace associated")
    }
    throw notFoundException("Invitation not found")
  }

  /** Builds an invitation URL on the host currently serving its workspace. */
  async buildInviteUrl(props: {
    code: string
    workspace: Pick<WorkspaceModel, "tenantId">
  }): Promise<string> {
    const servingHost = await resolveServingHost(props.workspace.tenantId)
    return joinAppUrl(
      servingHost.appUrl,
      `/invitations/${encodeURIComponent(props.code)}`,
    )
  }

  /**
   * The anonymous-visitor-safe summary for the public `/invitations/[code]`
   * page. `null` under the same conditions as `findActiveByCode` (unknown,
   * expired, workspace-less, or cross-tenant code).
   */
  async getInvitationDetails(
    code: string,
    { tenantId }: { tenantId: string },
  ): Promise<InvitationSummary | null> {
    const lookup = await this.lookupActive(code, tenantId)
    if (!lookup.ok) {
      this.logLookupRejection(lookup.log)
      return null
    }

    const inviter = await userService.findByIdOrFail(
      lookup.invitation.invitedBy,
    )
    return {
      code: lookup.invitation.code,
      expiresAt: lookup.invitation.expiresAt,
      workspace: {
        name: lookup.workspace.name,
        logo: lookup.workspace.logo,
        scheduledDeletionAt: lookup.workspace.scheduledDeletionAt,
      },
      inviter: { name: inviter.name, image: inviter.image },
    }
  }

  /** Issues a new shareable invite code for the workspace. */
  async create(props: {
    workspaceId: string
    invitedBy: string
    permissions: InvitationModel["permissions"]
    tx?: DatabaseClient
  }): Promise<InvitationModel> {
    const { workspaceId, invitedBy, permissions, tx } = props
    return await invitationRepository.create(
      {
        id: createId(),
        code: generateInvitationCode(),
        permissions,
        expiresAt: addDays(new Date(), INVITATION_TTL_DAYS),
        workspaceId,
        invitedBy,
      },
      tx,
    )
  }
}

export const invitationService = new InvitationService()
