import {
  type ChannelType,
  type InboundWebhookFieldMapping,
  type InboundWebhookIdentifier,
  type InboundWebhookInboxResolution,
  type InboundWebhookStructuralIssueCode,
  inboundWebhookStructuralIssueCodes,
  inboxStatuses,
  listInboundWebhookStructuralIssues,
} from "@chatbotx.io/database/partials"
import type { InboxModel } from "@chatbotx.io/database/types"
import { getInboxIdentifierStrategy } from "@chatbotx.io/utils/inbound-webhook-channel"
import { inboxService } from "../inbox/service"

export type EffectiveChannel = {
  channel: ChannelType
  inbox: InboxModel | null
}

/**
 * The channel a webhook acts on: the configured one in `payload` mode, the
 * chosen inbox's own channel in `inbox` mode. `null` when that inbox no longer
 * exists in the workspace. Shared by validation (does the inbox exist and is it
 * connected), preview and the worker.
 */
export const resolveEffectiveChannel = async (input: {
  workspaceId: string
  resolution: InboundWebhookInboxResolution
}): Promise<EffectiveChannel | null> => {
  const { workspaceId, resolution } = input
  if (resolution.mode === "payload") {
    return { channel: resolution.channel, inbox: null }
  }
  const inbox = await inboxService.find({
    where: { id: resolution.inboxId, workspaceId },
  })
  return inbox ? { channel: inbox.channel as ChannelType, inbox } : null
}

export const inboundWebhookConfigIssueCodes = [
  ...inboundWebhookStructuralIssueCodes,
  "inboxNotFound",
  "inboxDisconnected",
  "unsupportedInboxIdentifier",
] as const
export type InboundWebhookConfigIssueCode =
  (typeof inboundWebhookConfigIssueCodes)[number]

export type InboundWebhookConfigIssue = {
  field: "inboxResolution" | "identifiers" | "fieldMappings"
  code: InboundWebhookConfigIssueCode
}

const STRUCTURAL_ISSUE_FIELD: Record<
  InboundWebhookStructuralIssueCode,
  InboundWebhookConfigIssue["field"]
> = {
  inboxRequired: "inboxResolution",
  identifierRequired: "identifiers",
  fieldMappingRequired: "fieldMappings",
}

const checkInboxResolution = async (
  workspaceId: string,
  resolution: InboundWebhookInboxResolution,
): Promise<InboundWebhookConfigIssueCode | null> => {
  if (
    resolution.mode === "payload" &&
    !getInboxIdentifierStrategy(resolution.channel, resolution.identifierKind)
  ) {
    return "unsupportedInboxIdentifier"
  }
  const effective = await resolveEffectiveChannel({ workspaceId, resolution })
  if (!effective) {
    return "inboxNotFound"
  }
  const isDisconnected =
    effective.inbox !== null &&
    effective.inbox.status !== inboxStatuses.enum.connected
  return isDisconnected ? "inboxDisconnected" : null
}

/**
 * Cross-field rules the zod schemas cannot express (they need the workspace's
 * inboxes and the channel registry). Every save must be complete: an inbox
 * rule, at least one contact identity and at least one mapping. Whether the
 * identities can CREATE a contact is only a warning in the editor: a webhook
 * that updates existing contacts is valid.
 */
export const validateInboundWebhookConfig = async (input: {
  workspaceId: string
  inboxResolution: InboundWebhookInboxResolution | null
  identifiers: InboundWebhookIdentifier[]
  fieldMappings: InboundWebhookFieldMapping[]
}): Promise<InboundWebhookConfigIssue[]> => {
  const { workspaceId, inboxResolution } = input
  const issues: InboundWebhookConfigIssue[] =
    listInboundWebhookStructuralIssues(input).map((code) => ({
      field: STRUCTURAL_ISSUE_FIELD[code],
      code,
    }))
  if (!inboxResolution) {
    return issues
  }
  const issue = await checkInboxResolution(workspaceId, inboxResolution)
  return issue ? [...issues, { field: "inboxResolution", code: issue }] : issues
}
