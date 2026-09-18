import type { WhatsappCallPermissionResponse } from "@chatbotx.io/database/partials"
import { whatsappCallPermissionRepository } from "@chatbotx.io/database/repositories"
import type { WhatsappCallPermissionModel } from "@chatbotx.io/database/types"

const MS_PER_SECOND = 1000

/**
 * What the local permission record says the business may do before dialing a
 * consumer. `undefined` (no record at all) is deliberately not a member: the
 * caller renders "request permission" for a contact that never replied.
 */
export const callPermissionStatuses = {
  permanent: "permanent",
  temporary: "temporary",
  noPermission: "no_permission",
} as const

export type CallPermissionStatus =
  (typeof callPermissionStatuses)[keyof typeof callPermissionStatuses]

type CallPermissionStatusRule = {
  status: CallPermissionStatus
  matches: (permission: WhatsappCallPermissionModel, now: Date) => boolean
}

/**
 * Evaluated in order, first match wins; a record matching none of them (an
 * accepted temporary grant that has expired) resolves to `noPermission`.
 */
const CALL_PERMISSION_STATUS_RULES: readonly CallPermissionStatusRule[] = [
  {
    status: callPermissionStatuses.noPermission,
    matches: (permission) => permission.response === "reject",
  },
  {
    status: callPermissionStatuses.permanent,
    matches: (permission) => permission.isPermanent,
  },
  {
    status: callPermissionStatuses.temporary,
    matches: (permission, now) =>
      permission.expiresAt !== null && permission.expiresAt > now,
  },
]

export type RecordCallPermissionReplyInput = {
  workspaceId: string
  contactInboxId: string
  response: WhatsappCallPermissionResponse
  isPermanent: boolean
  /** Meta's `expiration_timestamp`, in Unix seconds. */
  expirationTimestamp?: number | null
  respondedAt: Date
}

class WhatsappCallPermissionService {
  /**
   * Stores a consumer's `call_permission_reply`. Newest response wins at the
   * repository, so redelivered or out-of-order webhooks never regress a grant.
   */
  async recordReply(input: RecordCallPermissionReplyInput): Promise<void> {
    await whatsappCallPermissionRepository.upsertForContactInbox({
      workspaceId: input.workspaceId,
      contactInboxId: input.contactInboxId,
      response: input.response,
      isPermanent: input.isPermanent,
      expiresAt: input.expirationTimestamp
        ? new Date(input.expirationTimestamp * MS_PER_SECOND)
        : null,
      respondedAt: input.respondedAt,
    })
  }

  /**
   * Stores a permanent grant learned without a reply message — Meta error
   * 138017 on a permission request means the consumer already granted one.
   */
  async recordPermanentGrant(input: {
    workspaceId: string
    contactInboxId: string
    grantedAt: Date
  }): Promise<void> {
    await this.recordReply({
      workspaceId: input.workspaceId,
      contactInboxId: input.contactInboxId,
      response: "accept",
      isPermanent: true,
      respondedAt: input.grantedAt,
    })
  }

  /**
   * Mirrors a grant the PROVIDER reported (Meta's `call_permissions` GET)
   * rather than one a consumer replied with, so the next read for this
   * contact is answered from the record instead of going back to Meta.
   *
   * Only a grant is ever mirrored. Writing `noPermission` would give the
   * record an answer for every contact it was asked about and permanently
   * silence the provider lookup that feeds it — and that lookup is the only
   * way to learn about a consumer who granted permission by CALLING the
   * business, which sends no reply message at all.
   *
   * A `temporary` grant is mirrored only when the provider also said when it
   * expires: without an expiry {@link resolveStatus} reads the record as
   * `noPermission`, which would cache exactly the negative this method
   * refuses to write. No expiry, no write — the next read asks again.
   *
   * Returns whether anything was written, so callers can log/test the
   * distinction rather than infer it.
   */
  async mirrorProviderGrant(input: {
    workspaceId: string
    contactInboxId: string
    status: CallPermissionStatus
    /** The provider's expiry for a temporary grant, in Unix seconds. */
    expirationTimestamp?: number | null
    observedAt?: Date
  }): Promise<boolean> {
    const isPermanent = input.status === callPermissionStatuses.permanent
    if (!(isPermanent || input.status === callPermissionStatuses.temporary)) {
      return false
    }
    if (!(isPermanent || input.expirationTimestamp)) {
      return false
    }

    await this.recordReply({
      workspaceId: input.workspaceId,
      contactInboxId: input.contactInboxId,
      response: "accept",
      isPermanent,
      expirationTimestamp: isPermanent ? null : input.expirationTimestamp,
      respondedAt: input.observedAt ?? new Date(),
    })
    return true
  }

  /** Resolves the contact's permission from the local record only — never calls Meta. */
  async resolveStatus(
    contactInboxId: string,
    now: Date = new Date(),
  ): Promise<CallPermissionStatus | undefined> {
    const permission =
      await whatsappCallPermissionRepository.findByContactInboxId(
        contactInboxId,
      )
    if (!permission) {
      return
    }
    return (
      CALL_PERMISSION_STATUS_RULES.find((rule) => rule.matches(permission, now))
        ?.status ?? callPermissionStatuses.noPermission
    )
  }
}

export const whatsappCallPermissionService = new WhatsappCallPermissionService()
