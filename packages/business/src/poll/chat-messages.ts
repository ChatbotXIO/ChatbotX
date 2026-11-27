import {
  type ButtonStepProps,
  buttonStepDefaultFn,
  getChannelFlowPolicy,
  type SendCardStepSchema,
  sendCarouselStepDefaultFn,
  sendCarouselStepSchema,
  sendImageStepDefaultFn,
  sendQuickReplyStepDefaultFn,
  sendQuickReplyStepSchema,
  sendTextStepDefaultFn,
  sendTextStepSchema,
  stepSupport,
  uploadModes,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { RichButtonPayloadEntry } from "@chatbotx.io/worker-config"
import type { PollBotStrings } from "./bot-strings"
import { getPollBotStrings } from "./bot-strings"
import { getPollState, type PollState } from "./state"

const CARD_TEXT_MAX = 80
const DEFAULT_BUTTON_LABEL_MAX = 20
const WHITESPACE_RE = /^\s+$/

type ButtonPayloads = Record<string, RichButtonPayloadEntry>
type Payload = RichButtonPayloadEntry["payload"]

export type PollChatMessage<Step> = {
  step: Step
  buttonPayloads: ButtonPayloads
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value)
  if (chars.length <= max) {
    return value
  }
  return `${chars
    .slice(0, max - 1)
    .join("")
    .trimEnd()}…`
}

function stateLabel(state: PollState, strings: PollBotStrings): string {
  if (state === "running") {
    return strings.votingStarted
  }
  if (state === "ended") {
    return strings.votingIsOver
  }
  return strings.votingStartsSoon
}

function makeFormatter(
  language: string,
  timezone: string,
): Intl.DateTimeFormat {
  const options = {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  } as const
  try {
    return new Intl.DateTimeFormat(language, options)
  } catch {
    // Either the locale or the workspace timezone can be invalid; fall back on
    // both so formatting never throws.
    return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" })
  }
}

/**
 * Formats a date with the AM/PM marker attached and lowercased ("12:00am", not
 * "12:00 AM") to save characters in the length-limited card subtitle. ICU
 * separates the marker with a narrow no-break space (U+202F), which `\s`
 * matches. Locales without a day period are unchanged.
 */
function formatCompact(format: Intl.DateTimeFormat, date: Date): string {
  const parts = format.formatToParts(date)
  return parts
    .map((part, index) => {
      if (part.type === "dayPeriod") {
        return part.value.toLowerCase()
      }
      if (
        part.type === "literal" &&
        WHITESPACE_RE.test(part.value) &&
        parts[index + 1]?.type === "dayPeriod"
      ) {
        return ""
      }
      return part.value
    })
    .join("")
}

export function formatPollSubtitle(input: {
  state: PollState
  startsAt: Date
  endsAt: Date
  language: string
  timezone: string
}): string {
  const format = makeFormatter(input.language, input.timezone)
  const label = stateLabel(input.state, getPollBotStrings(input.language))
  return truncate(
    `${label} | ${formatCompact(format, input.startsAt)} - ${formatCompact(format, input.endsAt)}`,
    CARD_TEXT_MAX,
  )
}

function buttonLabelMax(channel: string): number {
  return (
    getChannelFlowPolicy(channel)?.limits.buttonLabel ??
    DEFAULT_BUTTON_LABEL_MAX
  )
}

function makeButton(
  label: string,
  channel: string,
  executionId: string,
  payload: Payload,
  payloads: ButtonPayloads,
): ButtonStepProps {
  const button = buttonStepDefaultFn({
    label: truncate(label, buttonLabelMax(channel)),
  })
  payloads[button.id] = { executionId, buttonId: button.id, payload }
  return button
}

function makeCard(input: {
  title: string
  subtitle: string
  imageUrl: string | null
  buttons: ButtonStepProps[]
}): SendCardStepSchema {
  return {
    id: createId(),
    stepType: "sendCard",
    title: truncate(input.title, CARD_TEXT_MAX),
    subtitle: input.subtitle,
    image: input.imageUrl
      ? {
          ...sendImageStepDefaultFn(),
          mode: uploadModes.enum.url,
          url: input.imageUrl,
          buttons: [],
        }
      : undefined,
    buttons: input.buttons,
  }
}

function makeCarousel(cards: SendCardStepSchema[]) {
  return sendCarouselStepSchema.parse({ ...sendCarouselStepDefaultFn(), cards })
}

export function buildPollCardsMessage(input: {
  polls: Array<{
    id: string
    name: string
    imageUrl: string
    startsAt: Date
    endsAt: Date
  }>
  channel: string
  strings: PollBotStrings
  language: string
  timezone: string
  executionId: string
  now?: Date
}): PollChatMessage<ReturnType<typeof sendCarouselStepSchema.parse>> {
  const buttonPayloads: ButtonPayloads = {}
  const cards = input.polls.map((poll) => {
    const state = getPollState(poll, input.now)
    const buttons =
      state === "running"
        ? [
            makeButton(
              input.strings.vote,
              input.channel,
              input.executionId,
              { type: "poll_open", pollId: poll.id },
              buttonPayloads,
            ),
          ]
        : []
    return makeCard({
      title: poll.name,
      subtitle: formatPollSubtitle({
        state,
        startsAt: poll.startsAt,
        endsAt: poll.endsAt,
        language: input.language,
        timezone: input.timezone,
      }),
      imageUrl: poll.imageUrl,
      buttons,
    })
  })
  return { step: makeCarousel(cards), buttonPayloads }
}

export function buildCandidatesMessage(input: {
  poll: { id: string; imageUrl: string }
  candidates: Array<{
    id: string
    name: string
    description: string | null
    imageUrl: string | null
  }>
  channel?: string
  strings: PollBotStrings
  executionId: string
}): PollChatMessage<ReturnType<typeof sendCarouselStepSchema.parse>> {
  const buttonPayloads: ButtonPayloads = {}
  const channel = input.channel ?? ""
  const cards = input.candidates.map((candidate) =>
    makeCard({
      title: candidate.name,
      subtitle: truncate(candidate.description ?? "", CARD_TEXT_MAX),
      imageUrl: candidate.imageUrl || input.poll.imageUrl,
      buttons: [
        makeButton(
          input.strings.vote,
          channel,
          input.executionId,
          {
            type: "poll_vote",
            pollId: input.poll.id,
            candidateId: candidate.id,
          },
          buttonPayloads,
        ),
      ],
    }),
  )
  return { step: makeCarousel(cards), buttonPayloads }
}

export function buildVoteRegisteredMessage(input: {
  channel: string
  strings: PollBotStrings
  executionId: string
}):
  | PollChatMessage<ReturnType<typeof sendQuickReplyStepSchema.parse>>
  | PollChatMessage<ReturnType<typeof sendTextStepSchema.parse>> {
  const buttonPayloads: ButtonPayloads = {}
  const button = makeButton(
    input.strings.polls,
    input.channel,
    input.executionId,
    { type: "poll_list" },
    buttonPayloads,
  )
  const quickReplySupported =
    getChannelFlowPolicy(input.channel)?.steps.sendQuickReply ===
    stepSupport.full
  if (quickReplySupported) {
    return {
      step: sendQuickReplyStepSchema.parse(
        sendQuickReplyStepDefaultFn({
          message: input.strings.voteRegistered,
          buttons: [button],
        }),
      ),
      buttonPayloads,
    }
  }
  return {
    step: sendTextStepSchema.parse(
      sendTextStepDefaultFn({
        text: input.strings.voteRegistered,
        buttons: [button],
      }),
    ),
    buttonPayloads,
  }
}
