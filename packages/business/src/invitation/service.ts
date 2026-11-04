import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db } from "@chatbotx.io/database/client"
import { invitationRepository } from "@chatbotx.io/database/repositories"
import { invitationModel, ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import type { InvitationModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import { addDays } from "date-fns"
import { BaseService } from "../base.service"
import { customDomainService } from "../enterprise/custom-domain/service"
import { tenantService } from "../enterprise/tenant/service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { resolvePlatformAppUrl } from "../platform/settings"
import { userService } from "../user/service"
import { workspaceService } from "../workspace/service"

/** How long a shareable invite code stays usable. */
const INVITATION_TTL_DAYS = 1

/** 16 random bytes (128 bits), base64url-encoded. */
const INVITATION_CODE_BYTES = 16

/**
 * CSPRNG invite code. A sequential id (even a snowflake) is a solved puzzle
 * for an attacker who knows roughly when the invite was issued; this is not.
 * Web Crypto + `btoa` rather than `node:crypto`, because this module is also
 * traced into the Edge instrumentation bundle via the top-level barrel —
 * see `__tests__/edge-safe-import-graph.test.ts`.
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

class InvitationService extends BaseService {
  private isActive(
    invitation: InvitationModel,
  ): invitation is InvitationModel & { workspaceId: string } {
    return Boolean(invitation.workspaceId && invitation.expiresAt >= new Date())
  }

  /**
   * The tenant and app URL whose host currently serves a workspace. Suspended
   * tenants and tenants without an active custom domain fall back to root,
   * matching request-domain tenant resolution.
   */
  private async resolveServingHost(workspace: {
    tenantId: string
  }): Promise<{ tenantId: string; appUrl: string }> {
    if (workspace.tenantId === ROOT_TENANT_ID) {
      return {
        tenantId: ROOT_TENANT_ID,
        appUrl: resolvePlatformAppUrl(),
      }
    }

    const tenant = await tenantService.findById(workspace.tenantId)
    if (tenant?.status !== "active") {
      return {
        tenantId: ROOT_TENANT_ID,
        appUrl: resolvePlatformAppUrl(),
      }
    }

    const customDomain = await customDomainService.findActiveByTenantId(
      workspace.tenantId,
    )
    if (!customDomain) {
      return {
        tenantId: ROOT_TENANT_ID,
        appUrl: resolvePlatformAppUrl(),
      }
    }

    return {
      tenantId: workspace.tenantId,
      appUrl: `https://${customDomain.domain}`,
    }
  }

  private logLookupRejection(props: {
    invitationId?: string
    reason: "not_found" | "expired" | "no_workspace" | "tenant_mismatch"
    requestTenantId?: string
    servingTenantId?: string
    workspaceId?: string
  }) {
    logger.debug(props, "Invitation lookup rejected")
  }

  async findByCodeOrFail(code: string): Promise<InvitationModel> {
    const invitation = await invitationRepository.findByCode(code)
    if (!invitation) {
      throw notFoundException("Invitation not found")
    }
    return invitation
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
    const invitation = await invitationRepository.findByCode(code)
    if (!invitation) {
      this.logLookupRejection({ reason: "not_found" })
      return null
    }
    if (!this.isActive(invitation)) {
      if (invitation.expiresAt < new Date()) {
        this.logLookupRejection({
          invitationId: invitation.id,
          reason: "expired",
        })
      } else {
        this.logLookupRejection({
          invitationId: invitation.id,
          reason: "no_workspace",
        })
      }
      return null
    }

    const workspace = await workspaceService.find({
      where: { id: invitation.workspaceId },
    })
    if (!workspace) {
      this.logLookupRejection({
        invitationId: invitation.id,
        reason: "no_workspace",
        workspaceId: invitation.workspaceId,
      })
      return null
    }

    const servingHost = await this.resolveServingHost(workspace)
    if (servingHost.tenantId !== tenantId) {
      this.logLookupRejection({
        invitationId: invitation.id,
        reason: "tenant_mismatch",
        requestTenantId: tenantId,
        servingTenantId: servingHost.tenantId,
        workspaceId: invitation.workspaceId,
      })
      return null
    }

    return invitation
  }

  async findActiveByCodeOrFail(
    code: string,
    tenantId: string,
  ): Promise<InvitationModel & { workspaceId: string }> {
    const invitation = await this.findByCodeOrFail(code)
    if (!this.isActive(invitation)) {
      if (invitation.expiresAt < new Date()) {
        throw new ChatbotXException("Invitation expired")
      }
      throw new ChatbotXException("Invalid invitation: no workspace associated")
    }

    const workspace = await workspaceService.find({
      where: { id: invitation.workspaceId },
    })
    if (!workspace) {
      throw notFoundException("Invitation not found")
    }
    const servingHost = await this.resolveServingHost(workspace)
    if (servingHost.tenantId !== tenantId) {
      // Same response as an unknown code: a cross-tenant guess must not be
      // distinguishable from one that never existed.
      throw notFoundException("Invitation not found")
    }
    return invitation
  }

  /** Builds an invitation URL on the host currently serving its workspace. */
  async buildInviteUrl(invitation: InvitationModel): Promise<string> {
    if (!invitation.workspaceId) {
      throw new ChatbotXException("Invalid invitation: no workspace associated")
    }

    const workspace = await workspaceService.find({
      where: { id: invitation.workspaceId },
    })
    if (!workspace) {
      throw notFoundException("Invitation not found")
    }

    const servingHost = await this.resolveServingHost(workspace)
    return joinAppUrl(
      servingHost.appUrl,
      `/invitations/${encodeURIComponent(invitation.code)}`,
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
    const invitation = await this.findActiveByCode(code, { tenantId })
    if (!invitation) {
      return null
    }

    const [inviter, workspace] = await Promise.all([
      userService.findByIdOrFail(invitation.invitedBy),
      workspaceService.find({ where: { id: invitation.workspaceId } }),
    ])

    return {
      code: invitation.code,
      expiresAt: invitation.expiresAt,
      workspace: workspace
        ? {
            name: workspace.name,
            logo: workspace.logo,
            scheduledDeletionAt: workspace.scheduledDeletionAt,
          }
        : null,
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
    const { workspaceId, invitedBy, permissions, tx = db } = props
    const [invitation] = await tx
      .insert(invitationModel)
      .values({
        id: createId(),
        code: generateInvitationCode(),
        permissions,
        expiresAt: addDays(new Date(), INVITATION_TTL_DAYS),
        workspaceId,
        invitedBy,
      })
      .returning()
    return invitation
  }
}

export const invitationService = new InvitationService()
