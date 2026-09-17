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
