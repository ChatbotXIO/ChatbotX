import {
  aiHandoverSettingsService,
  threadControlService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { requestThreadControlAction } from "@chatbotx.io/channel-registry/thread-control"
import {
  parseAiHandoverChannel,
  threadControlRoles,
} from "@chatbotx.io/database/partials"
import { ChannelError } from "@chatbotx.io/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobAiHandoverTakeBack,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

type TakeBackJobData = IntegrationJobAiHandoverTakeBack["data"]

type CurrentThreadState = Awaited<
  ReturnType<typeof threadControlService.resolveCurrentState>
>

type EnqueueTakeBackProps = {
  workspaceId: string
  inboxId: string
  integrationType: string
  integrationIdentifier: string
  /** The channel's owner-delivery form of the message; absent = cannot replay. */
  ownerReplayPayload: unknown
  /** The channel's AI-agent app id; absent = the AI cannot be recognised. */
  aiAgentAppId: string | undefined
  standbyCopy: {
    id: string
    conversationId: string
    contactInboxId: string
    messageType: string
  }
}

/**
 * What the take-back still has to do for a thread:
 * - `take`: the AI agent holds it (standby): take it, then replay;
 * - `replay`: this app already took it from the AI agent (an earlier message of
 *   a burst, or a retry after the take): replay only;
 * - `null`: nothing. A thread a partner holds, an idle one, or one owned for
 *   any other reason is never touched.
 */
type TakeBackStage = "take" | "replay"

const resolveStage = (
  current: CurrentThreadState,
  aiAgentAppId: string,
): TakeBackStage | null => {
  if (!current) {
    return null
  }
  if (
    current.state === "standby" &&
    current.ownerRole === threadControlRoles.enum.ai_agent
  ) {
    return "take"
  }
  const isTakenFromAiAgent =
    current.state === "owned" &&
    current.lastEvent === "taken" &&
    current.previousOwnerAppId === aiAgentAppId
  return isTakenFromAiAgent ? "replay" : null
}

/**
 * Meta does not redeliver the message, so the job rides out a rate limit or a
 * transient failure: 5 attempts with exponential backoff, and `removeOnFail`
 * frees the deterministic job id so a later hand-back can queue it again.
 */
const TAKE_BACK_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnFail: true,
} as const

const takeBackJobId = (messageId: string): string => `ai-takeback-${messageId}`
const replayJobId = (messageId: string): string =>
  `ai-takeback-replay-${messageId}`

/**
 * A thread-control rejection a retry cannot fix (the channel refuses the call,
 * we no longer own the thread, the contact is gone). Such a failure is logged
 * and the job completes; anything else rethrows so BullMQ retries: a rate
 * limit, a network error, and an unclassified failure such as a timeout, which
 * is neither retryable nor permanent by category. Shared by the archive release
 * and this take-back.
 */
export const isPermanentThreadControlFailure = (err: unknown): boolean =>
  (err instanceof ChannelError && err.isPermanent) ||
  err instanceof ChatbotXException

/**
 * After a customer message was stored from a standby delivery: queues the
 * take-back while the Page's AI hand-off is configured but not running and
 * either the AI agent holds the thread (take, then replay) or this app already
 * took it from the AI (replay only, so a burst of messages is all answered).
 * Cheap, cached filters first; the thread row only for a due workspace. The job
 * re-checks the thread. A failure here rethrows with the message already
 * stored, so the standby job retries and queues it again under the same id.
 */
export async function enqueueAiHandoverTakeBackIfDue(
  props: EnqueueTakeBackProps,
): Promise<void> {
  const { standbyCopy, ownerReplayPayload, aiAgentAppId } = props
  const channel = parseAiHandoverChannel(props.integrationType)
  if (
    !(channel && ownerReplayPayload && aiAgentAppId) ||
    standbyCopy.messageType !== "incoming"
  ) {
    return
  }
  // Both stages need the automation configured but NOT running: a take-over by
  // a human agent also reads as "taken from the AI", and while the automation
  // runs the AI answers, so a message it received must not be replayed to the
  // bot. Cached, and only a configured Page goes further.
  const isTakeBackDue = await aiHandoverSettingsService.isConfiguredAndInactive(
    {
      workspaceId: props.workspaceId,
      inboxId: props.inboxId,
    },
  )
  if (!isTakeBackDue) {
    return
  }
  const current = await threadControlService.resolveCurrentState({
    workspaceId: props.workspaceId,
    contactInboxId: standbyCopy.contactInboxId,
  })
  if (!(current && resolveStage(current, aiAgentAppId))) {
    return
  }

  await integrationQueue.add(
    IntegrationJobAction.aiHandoverTakeBack,
    {
      type: IntegrationJobAction.aiHandoverTakeBack,
      data: {
        workspaceId: props.workspaceId,
        inboxId: props.inboxId,
        integrationType: props.integrationType,
        integrationIdentifier: props.integrationIdentifier,
        contactInboxId: standbyCopy.contactInboxId,
        conversationId: standbyCopy.conversationId,
        messageId: standbyCopy.id,
        aiAgentAppId,
        threadControlUpdatedAt:
          current.threadControlUpdatedAt?.toISOString() ?? null,
        ownerReplayPayload,
      },
    },
    { ...TAKE_BACK_JOB_OPTIONS, jobId: takeBackJobId(standbyCopy.id) },
  )
}

const replayAsOwnerDelivery = async (data: TakeBackJobData): Promise<void> => {
  await integrationQueue.add(
    IntegrationJobAction.incomingMessage,
    {
      type: IntegrationJobAction.incomingMessage,
      data: {
        integrationType: data.integrationType,
        integrationIdentifier: data.integrationIdentifier,
        payload: data.ownerReplayPayload,
      },
    },
    { jobId: replayJobId(data.messageId) },
  )
}

const readCurrent = (data: TakeBackJobData): Promise<CurrentThreadState> =>
  threadControlService.resolveCurrentState({
    workspaceId: data.workspaceId,
    contactInboxId: data.contactInboxId,
  })

/**
 * Takes the thread at the version the job was queued for. Resolves `true` when
 * this app now holds it. A newer event (the AI handing back, a partner taking
 * over) wins and nothing is taken. A refusal a retry cannot fix resolves
 * `false`, except when a concurrent take of the same burst already got us the
 * thread: then it is ours and the message must still be replayed. A retryable
 * channel error rethrows so the job retries.
 */
const takeThread = async (data: TakeBackJobData): Promise<boolean> => {
  try {
    const snapshot = await requestThreadControlAction({
      workspaceId: data.workspaceId,
      contactInboxId: data.contactInboxId,
      conversationId: data.conversationId,
      action: "take",
      // Re-checked inside requestAction before the channel call.
      expectedThreadControlUpdatedAt: data.threadControlUpdatedAt
        ? new Date(data.threadControlUpdatedAt)
        : null,
    })
    // Owned through OUR take. An owned snapshot from anything else (the AI
    // handing the thread back between the read and the take, whose hand-back
    // response answers the customer) is a newer event that wins: no replay.
    return (
      snapshot.threadControlState === "owned" &&
      snapshot.threadControlLastEvent === "taken"
    )
  } catch (err) {
    if (!isPermanentThreadControlFailure(err)) {
      throw err
    }
    if (resolveStage(await readCurrent(data), data.aiAgentAppId) === "replay") {
      return true
    }
    logger.warn(
      { err, contactInboxId: data.contactInboxId },
      "AI take-back was refused; the AI keeps the thread and the bot stays silent",
    )
    return false
  }
}

/**
 * `aiHandoverTakeBack` job: takes the thread back from the AI agent and has the
 * bot answer the customer's message. The thread is re-read here:
 * - already taken by us from the AI (an earlier message of the burst, or a retry
 *   after the take): replay only, whatever the settings are now; the replay's
 *   one-time promotion claim makes the automation run exactly once;
 * - the AI agent still holds it: take it, but only while the AI automation is
 *   still not running, then replay (a newer event wins and nothing is replayed);
 * - anything else: nothing. A thread another app holds is never taken.
 */
export async function runAiHandoverTakeBack(
  data: TakeBackJobData,
): Promise<void> {
  if (!parseAiHandoverChannel(data.integrationType)) {
    return
  }
  const stage = resolveStage(await readCurrent(data), data.aiAgentAppId)

  if (stage === "replay") {
    await replayAsOwnerDelivery(data)
    return
  }
  if (stage !== "take") {
    logger.info(
      { contactInboxId: data.contactInboxId },
      "AI take-back skipped: the AI agent no longer holds the thread",
    )
    return
  }

  const isTakeBackDue = await aiHandoverSettingsService.isConfiguredAndInactive(
    {
      workspaceId: data.workspaceId,
      inboxId: data.inboxId,
    },
  )
  if (!isTakeBackDue) {
    logger.info(
      { contactInboxId: data.contactInboxId },
      "AI take-back skipped: the AI automation is running or not configured",
    )
    return
  }
  if (await takeThread(data)) {
    await replayAsOwnerDelivery(data)
  }
}
