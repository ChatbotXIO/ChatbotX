/**
 * Keeps one inbound call from being answered by two tabs of the same browser.
 * Every tab rings, and the server's claim lets only one accept through - but
 * a second tab that clicks at the same time still fetches TURN, opens the mic
 * and sends its own answer SDP before the server turns it away. The Web Lock
 * settles it in the browser, before any of that. The other tabs keep ringing
 * until the server's claimed-elsewhere broadcast, so a failed answer here
 * leaves them free to answer.
 */

const ANSWER_LOCK_PREFIX = "whatsapp-voip-answer:"

export type AnswerLockOutcome<T> =
  | { acquired: true; result: T }
  | { acquired: false }

/**
 * Runs `run` only if no other tab holds the answer lock for this call, and
 * holds it until `run` settles. Without the Web Locks API every tab proceeds
 * and the server's claim remains the only arbiter, as before.
 */
export async function runWithAnswerLock<T>(
  whatsappCallId: string,
  run: () => Promise<T>,
): Promise<AnswerLockOutcome<T>> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return { acquired: true, result: await run() }
  }
  // The lib typing does not unwrap an async callback's promise; awaiting does.
  return await navigator.locks.request(
    `${ANSWER_LOCK_PREFIX}${whatsappCallId}`,
    { ifAvailable: true },
    async (lock): Promise<AnswerLockOutcome<T>> =>
      lock ? { acquired: true, result: await run() } : { acquired: false },
  )
}
