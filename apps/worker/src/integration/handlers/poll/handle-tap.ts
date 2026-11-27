import {
  buildVoteRegisteredMessage,
  getPollState,
  pollService,
  pollVoteService,
} from "@chatbotx.io/business/poll"
import type { PollWithCandidates } from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  sendTextStepDefaultFn,
  sendTextStepSchema,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import type { RichButtonPayload } from "../rich-response/button-payload"
import { MESSAGE_ORDER_DELAY_MS } from "../rich-response/constants"
import {
  loadPollLocale,
  sendCandidates,
  sendPollCard,
  sendPollList,
  sendPollStep,
} from "./send"

export type PollTapPayload = Extract<
  RichButtonPayload,
  { type: "poll_open" | "poll_vote" | "poll_list" }
>

type TapProps = {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
}

const LIST_LIMIT = 10

/**
 * Loads a poll and re-validates it on every tap: the stored button payload is
 * trusted for *which* poll/candidate was tapped, never for whether it still
 * exists or belongs to the conversation's workspace.
 */
async function loadPoll(
  pollId: string,
  conversation: ConversationModel,
): Promise<PollWithCandidates | null> {
  const poll = await pollService.findUnscopedWithCandidates(pollId)
  if (!poll) {
    logger.warn({ pollId }, "Poll tap: poll not found")
    return null
  }
  if (poll.workspaceId !== conversation.workspaceId) {
    logger.warn({ pollId }, "Poll tap: workspace mismatch")
    return null
  }
  return poll
}

async function runAfterVoteFlow(
  props: TapProps & { flowId: string; jobId: string },
) {
  const { conversation, contactInbox, flowId, jobId } = props
  await integrationQueue.add(
    IntegrationJobAction.sendFlow,
    {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        flowId,
        origin: webhookChannelOrigin(),
      },
    },
    // Deterministic per vote, so a retried tap re-attempting the enqueue cannot
    // run the flow twice.
    { delay: MESSAGE_ORDER_DELAY_MS, jobId },
  )
}

async function handleVote(
  props: TapProps & { payload: Extract<PollTapPayload, { type: "poll_vote" }> },
) {
  const { conversation, contactInbox, payload } = props
  const outcome = await pollVoteService.castVote({
    workspaceId: conversation.workspaceId,
    pollId: payload.pollId,
    candidateId: payload.candidateId,
    contactId: conversation.contactId,
    contactInboxId: contactInbox.id,
  })

  if ("rejected" in outcome) {
    if (outcome.rejected === "pollNotFound") {
      logger.warn({ pollId: payload.pollId }, "Poll tap: poll not found")
      return
    }
    // castVote loaded the poll scoped to this conversation's workspace.
    const { poll } = outcome
    if (outcome.rejected === "candidateNotFound") {
      await sendCandidates({ conversation, contactInbox, poll })
      return
    }
    await sendPollCard({ conversation, contactInbox, poll })
    return
  }

  // Enqueue the after-vote flow first: the vote is already committed, so a
  // retry of this job must not lose it — castVote re-offers the flow for a
  // retry shortly after the vote, and the job id dedups it. The delay keeps it
  // after the success message below.
  if (outcome.afterVoteFlowId && outcome.afterVoteFlowJobId) {
    await runAfterVoteFlow({
      conversation,
      contactInbox,
      flowId: outcome.afterVoteFlowId,
      jobId: outcome.afterVoteFlowJobId,
    })
  }

  const { strings } = await loadPollLocale(conversation.workspaceId)
  const executionId = createId()
  const { step, buttonPayloads } = buildVoteRegisteredMessage({
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

async function handleList(props: TapProps) {
  const { conversation, contactInbox } = props
  // WhatsApp cards are interactive-list rows: an ended poll is not actionable,
  // so the running filter is applied in the query (before the limit) — newer
  // ended polls must not push a running one out of the list.
  const polls = await pollService.listRecent({
    workspaceId: conversation.workspaceId,
    limit: LIST_LIMIT,
    runningAt: contactInbox.channel === "whatsapp" ? new Date() : undefined,
  })

  if (polls.length > 0) {
    await sendPollList({ conversation, contactInbox, polls })
    return
  }

  const { strings } = await loadPollLocale(conversation.workspaceId)
  const executionId = createId()
  await sendPollStep({
    conversationId: conversation.id,
    step: sendTextStepSchema.parse(
      sendTextStepDefaultFn({ text: strings.noOpenPolls }),
    ),
    buttonPayloads: {},
    executionId,
  })
}

export async function handlePollTap(
  props: TapProps & { payload: PollTapPayload },
): Promise<void> {
  const { conversation, contactInbox, payload } = props
  if (payload.type === "poll_list") {
    await handleList({ conversation, contactInbox })
    return
  }
  if (payload.type === "poll_vote") {
    await handleVote({ conversation, contactInbox, payload })
    return
  }
  const poll = await loadPoll(payload.pollId, conversation)
  if (!poll) {
    return
  }
  if (getPollState(poll) === "running") {
    await sendCandidates({ conversation, contactInbox, poll })
    return
  }
  await sendPollCard({ conversation, contactInbox, poll })
}
