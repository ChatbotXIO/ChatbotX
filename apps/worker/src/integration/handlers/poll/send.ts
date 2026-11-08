import { workspaceService } from "@chatbotx.io/business"
import {
  buildCandidatesMessage,
  buildPollCardsMessage,
  getPollBotStrings,
} from "@chatbotx.io/business/poll"
import type { PollWithCandidates } from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
  PollModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  type ChatJobSendFlowStep,
  chatQueue,
  type RichButtonPayloadEntry,
} from "@chatbotx.io/worker-config"

/**
 * Sentinel flow id for poll messages. Poll messages belong to no flow, but the
 * button encoders need a decodable `<flowId>:...:<buttonId>` payload, and the
 * tap handler resolves the real action server-side by `buttonId`. `"0"` never
 * matches a flow id, so flow analytics find no session for it and skip it.
 */
export const POLL_FLOW_CONTEXT_ID = "0"

/**
 * How far back a poll button tap may resolve its stored payload. Poll cards stay
 * votable for the whole poll window, far beyond the default 7-day rich-response
 * lookback.
 */
export const POLL_RICH_RESPONSE_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

type PollCardInput = Pick<
  PollModel,
  "id" | "name" | "imageUrl" | "startsAt" | "endsAt"
>

type PollSendProps = {
  conversation: Pick<ConversationModel, "id" | "workspaceId">
  contactInbox: Pick<ContactInboxModel, "channel">
}

export async function sendPollStep(props: {
  conversationId: string
  step: ChatJobSendFlowStep["data"]["step"]
  buttonPayloads: Record<string, RichButtonPayloadEntry>
  executionId: string
}): Promise<void> {
  const { conversationId, executionId } = props
  await chatQueue.add(
    ChatJobAction.sendFlowMessage,
    {
      type: ChatJobAction.sendFlowMessage,
      data: {
        conversationId,
        flowId: POLL_FLOW_CONTEXT_ID,
        step: props.step,
        richResponse: {
          executionId,
          buttonPayloads: props.buttonPayloads,
        },
      },
    },
    { jobId: `poll-${conversationId}-${executionId}` },
  )
}

export async function loadPollLocale(workspaceId: string) {
  const workspace = await workspaceService.findById({ id: workspaceId })
  return {
    language: workspace.language,
    timezone: workspace.timezone,
    strings: getPollBotStrings(workspace.language),
  }
}

export async function sendPollList(
  props: PollSendProps & { polls: PollCardInput[] },
): Promise<void> {
  const { conversation, contactInbox, polls } = props
  const { language, timezone, strings } = await loadPollLocale(
    conversation.workspaceId,
  )
  const executionId = createId()
  const { step, buttonPayloads } = buildPollCardsMessage({
    polls,
    channel: contactInbox.channel,
    strings,
    language,
    timezone,
    executionId,
  })
  await sendPollStep({
    conversationId: conversation.id,
    step,
    buttonPayloads,
    executionId,
  })
}

export async function sendPollCard(
  props: PollSendProps & { poll: PollCardInput },
): Promise<void> {
  await sendPollList({
    conversation: props.conversation,
    contactInbox: props.contactInbox,
    polls: [props.poll],
  })
}

export async function sendCandidates(
  props: PollSendProps & { poll: PollWithCandidates },
): Promise<void> {
  const { conversation, contactInbox, poll } = props
  const { strings } = await loadPollLocale(conversation.workspaceId)
  const executionId = createId()
  const { step, buttonPayloads } = buildCandidatesMessage({
    poll,
    candidates: poll.candidates,
    channel: contactInbox.channel,
    strings,
    executionId,
  })
  await sendPollStep({
    conversationId: conversation.id,
    step,
    buttonPayloads,
    executionId,
  })
}
