import { resolveSendTextLengthLimits } from "@chatbotx.io/flow-config"

/**
 * Share of the channel's text limit offered to the model. The answer is
 * usually sent through a Send Text step that wraps it in authored copy
 * (`Kết quả: {{ai_answer}}`), and models count characters loosely, so the
 * prompt asks for less than the channel accepts.
 */
const OUTPUT_BUDGET_RATIO = 0.8

/**
 * Character budget for an AI step answer delivered on `channel`, derived from
 * the same per-channel table that validates Send Text at publish time. An
 * unknown or missing channel falls back to the conservative omnichannel limit.
 */
export function resolveAIOutputCharBudget(
  channel: string | null | undefined,
): number {
  const { text } = resolveSendTextLengthLimits({ channel })

  return Math.floor(text * OUTPUT_BUDGET_RATIO)
}

/**
 * System instruction asking the model to keep its answer within one chat
 * message on `channel`. A prompt is a request, not a guarantee: the model can
 * still overshoot, and the channel then rejects the send.
 */
export function buildChannelLengthInstruction(
  channel: string | null | undefined,
): string {
  const budget = resolveAIOutputCharBudget(channel)
  const channelName = channel?.trim()
  const destination = channelName
    ? `one ${channelName} chat message`
    : "one chat message"

  return `Your answer will be sent as ${destination}. Keep it under ${budget} characters including spaces. Use plain text, no markdown headings.`
}

/**
 * Appends the channel length instruction to an author-written system prompt.
 * It goes last so it reads as the final constraint, after the author's own
 * guidance.
 */
export function withChannelLengthInstruction(
  system: string | null | undefined,
  channel: string | null | undefined,
): string {
  const instruction = buildChannelLengthInstruction(channel)
  const authored = system?.trim()

  return authored ? `${authored}\n\n${instruction}` : instruction
}
