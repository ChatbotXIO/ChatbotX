import { contactService } from "@chatbotx.io/business"
import { contactFilterFields } from "@chatbotx.io/database/partials"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import type { ConditionStepSchema } from "@chatbotx.io/flow-config"
import {
  refreshContactProfileSnapshot,
  resolveContactVariablesDeep,
} from "@chatbotx.io/variables"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { type ExecuteStepProps, seekConnectedNode } from "./flow-utils"

/** Filter fields read from the channel profile snapshot columns. */
const profileSnapshotFilterFields: ReadonlySet<string> = new Set([
  contactFilterFields.enum.followsBusinessOnInstagram,
  contactFilterFields.enum.businessFollowsUserOnInstagram,
  contactFilterFields.enum.verifiedAccountOnInstagram,
  contactFilterFields.enum.followerCountOnInstagram,
])

const usesProfileSnapshotField = (cases: ConditionStepSchema["cases"]) =>
  cases.some((conditionCase) =>
    conditionCase.conditions.some((condition) =>
      profileSnapshotFilterFields.has(condition.field),
    ),
  )

export async function handleCondition(
  props: ExecuteStepProps<ConditionStepSchema>,
): Promise<void> {
  const {
    conversation,
    contactInbox,
    flowVersion,
    step,
    useLatestFlowVersion,
    sendFrom,
    sentByUserId,
    nodeVisits,
    metadata,
    trackingContext,
    commentAnchor,
    appointmentId,
    startedByContactMessage,
  } = props

  const resolveMatchedHandleId = async (): Promise<string> => {
    try {
      // The snapshot is captured once at contact creation; a flow re-checking
      // "follows business" after the contact followed must see the live value.
      if (usesProfileSnapshotField(step.cases)) {
        await refreshContactProfileSnapshot({
          contactInbox,
          workspaceId: conversation.workspaceId,
        })
      }

      const resolvedCases = await resolveContactVariablesDeep(
        conversation.contactId,
        step.cases,
        {
          contactInbox,
          conversation,
          ...(appointmentId ? { appointmentId } : {}),
          ...(sentByUserId ? { sentByUserId } : {}),
        },
      )

      for (const conditionCase of resolvedCases) {
        if (conditionCase.conditions.length === 0) {
          continue
        }

        const isMatched = await contactService.matchesContactFilter({
          workspaceId: conversation.workspaceId,
          contactId: conversation.contactId,
          contactFilter: {
            operator: conditionCase.operator,
            conditions: conditionCase.conditions,
            // Timezone captured in the editor's browser at save time; the worker
            // has no browser context, so naive date values are interpreted here.
            timezone: conditionCase.timezone,
          },
        })
        if (isMatched) {
          return conditionCase.id
        }
      }
    } catch (error) {
      logger.error(
        { err: error, conversationId: conversation.id, stepId: step.id },
        "[handleCondition] filter evaluation failed; routing to otherwise",
      )
    }

    return step.otherwiseId
  }

  const matchedHandleId = await resolveMatchedHandleId()
  const connectedNodeId = seekConnectedNode(flowVersion, matchedHandleId)
  if (!connectedNodeId) {
    return
  }

  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      flowId: flowVersion.flowId,
      flowVersionId: useLatestFlowVersion ? undefined : flowVersion.id,
      nodeId: connectedNodeId,
      metadata,
      appointmentId,
      trackingContext,
      sendFrom,
      sentByUserId,
      startedByContactMessage,
      nodeVisits,
      commentAnchor,
      origin: webhookChannelOrigin(),
    },
  })
}
