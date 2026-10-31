import { aiTimeouts } from "@chatbotx.io/ai"
import type { AISpeechToTextProvider } from "@chatbotx.io/flow-config"
import { HeavyJobAction } from "@chatbotx.io/worker-config"
import { env } from "../env"

type HeavyStepAction = Extract<
  HeavyJobAction,
  "aiEditImage" | "aiGenerateImage" | "aiSpeechToText" | "aiTextToSpeech"
>

/** Abort deadline for one Speech to Text provider attempt. */
export function getSpeechToTextAttemptTimeoutMs(
  provider: AISpeechToTextProvider,
): number {
  switch (provider) {
    case "openai":
      return aiTimeouts.aiTotal
    case "muse":
      return env.MUSE_TRANSCRIBE_TIMEOUT_MS
    default: {
      const exhaustive: never = provider
      throw new Error(`Unsupported speech-to-text provider: ${exhaustive}`)
    }
  }
}

/**
 * Caller-side budget for one attempt of a heavy flow step: the completion
 * deadline and the fallback resume are sized from it, so a long Muse upload
 * is never resumed as an error while it still runs. The parent integration
 * job does not wait for a flow heavy step (it returns `wait`), so its lock
 * is not sized from this.
 */
export function getHeavyStepAttemptBudgetMs(
  action: HeavyStepAction,
  provider: string | undefined,
): number {
  if (action === HeavyJobAction.aiSpeechToText && provider === "muse") {
    return Math.max(
      env.HEAVY_JOB_WAIT_TIMEOUT_MS,
      env.MUSE_TRANSCRIBE_TIMEOUT_MS,
    )
  }
  return env.HEAVY_JOB_WAIT_TIMEOUT_MS
}

/** Longest single attempt any heavy flow step may run; sizes the heavy lock. */
export function getMaxHeavyStepAttemptBudgetMs(): number {
  return Math.max(env.HEAVY_JOB_WAIT_TIMEOUT_MS, env.MUSE_TRANSCRIBE_TIMEOUT_MS)
}
