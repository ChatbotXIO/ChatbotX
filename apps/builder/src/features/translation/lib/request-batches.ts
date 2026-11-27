import { chunk } from "remeda"
import { MAX_TRANSLATION_REQUEST_MESSAGES } from "../schema/action"

/** Asked for again 1.5 s after the last new message, so a burst is one request. */
export const REQUEST_GATHER_DELAY_MS = 1500
/** No answer after this long: show "still waiting" with a manual re-request. */
export const WAITING_AFTER_MS = 30_000

export type RequestCandidate = {
  id: string
  createdAt: Date
  /** Text and target language the request is for: a change means ask again. */
  signature: string
}

/**
 * Which candidates to send, in requests of at most 20 messages (35 messages are
 * two requests, none left out). A candidate already asked for with the same
 * signature is skipped; an edited message (new text) or a changed workspace
 * language (new signature) is asked for again.
 */
export function planRequests(input: {
  candidates: RequestCandidate[]
  asked: ReadonlyMap<string, string>
}): RequestCandidate[][] {
  const fresh = input.candidates.filter(
    (candidate) => input.asked.get(candidate.id) !== candidate.signature,
  )
  return chunk(fresh, MAX_TRANSLATION_REQUEST_MESSAGES)
}

export const requestSignature = (
  text: string | null,
  workspaceLanguage: string | null,
): string => `${workspaceLanguage ?? ""}\u0000${text ?? ""}`
