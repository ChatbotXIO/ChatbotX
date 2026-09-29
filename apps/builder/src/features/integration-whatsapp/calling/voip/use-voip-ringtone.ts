"use client"

import { useEffect } from "react"

/**
 * Which tone an offer should make, chosen by what the agent is doing right now,
 * not by who is calling. Ring-all means an already mid-conversation agent gets
 * rung too, and a full repeating ring for the offer's whole ~30-55s deadline
 * would make the call they're on impossible to hold. Mirrors phone systems'
 * call-waiting beep for a busy party.
 */
export const voipRingtoneModes = {
  /** The agent is free to take the call: a full ring, repeating until the offer ends. */
  ring: "ring",
  /** The agent is mid-conversation: a short, quiet beep, a couple of times, then silence. */
  callWaiting: "callWaiting",
} as const

export type VoipRingtoneMode =
  (typeof voipRingtoneModes)[keyof typeof voipRingtoneModes]

type VoipTonePattern = {
  /** Simultaneous frequencies in Hz — two make the classic ring, one is a plain beep. */
  frequencies: readonly number[]
  durationS: number
  gapS: number
  /** Kept low so the tone is audible but never startling / clipping. */
  gain: number
  /** How many tones to play; null repeats for as long as the offer stands. */
  repeats: number | null
}

/**
 * One entry per mode, so adding a tone is adding a row here rather than
 * threading another boolean through the hook.
 */
const TONE_PATTERN_BY_MODE: Record<VoipRingtoneMode, VoipTonePattern> = {
  ring: {
    frequencies: [440, 480],
    durationS: 1,
    gapS: 2,
    gain: 0.14,
    repeats: null,
  },
  callWaiting: {
    // Half the volume and a quarter the length of a ring, twice — enough to
    // notice, not enough to derail the conversation in progress.
    frequencies: [440],
    durationS: 0.25,
    gapS: 0.25,
    gain: 0.07,
    repeats: 2,
  },
}

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

/**
 * Plays a synthesized phone tone (Web Audio API, no asset) while active is
 * true. `restartKey` re-arms a finite pattern: callWaiting falls silent after
 * its beeps, so a second offer arriving while the first is still pending
 * needs a changed restartKey to sound again, since `active` alone wouldn't
 * change. If the browser blocks audio without a fresh gesture, the tone is
 * silently skipped rather than throwing.
 */
export function useVoipRingtone(
  active: boolean,
  mode: VoipRingtoneMode = voipRingtoneModes.ring,
  restartKey: number | string = 0,
): void {
  // `restartKey` is an intentional re-arm trigger, deliberately not read in
  // the body — same shape as `ringingFingerprint` in `use-whatsapp-voip-call`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restartKey re-arms the finite call-waiting pattern on purpose
  useEffect(() => {
    if (!active) {
      return
    }

    const AudioCtx =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!AudioCtx) {
      return
    }

    const pattern = TONE_PATTERN_BY_MODE[mode]
    const periodMs = (pattern.durationS + pattern.gapS) * 1000
    const ctx = new AudioCtx()
    ctx.resume().catch(() => undefined)
    let stopped = false
    let played = 0
    let interval: ReturnType<typeof setInterval> | undefined

    const playTone = () => {
      if (stopped) {
        return
      }
      played += 1
      const start = ctx.currentTime + 0.05
      for (const frequency of pattern.frequencies) {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = "sine"
        oscillator.frequency.value = frequency
        // Short fade in/out so each tone doesn't click.
        const fade = Math.min(0.05, pattern.durationS / 4)
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(pattern.gain, start + fade)
        gain.gain.setValueAtTime(pattern.gain, start + pattern.durationS - fade)
        gain.gain.linearRampToValueAtTime(0, start + pattern.durationS)
        oscillator.connect(gain).connect(ctx.destination)
        oscillator.start(start)
        oscillator.stop(start + pattern.durationS)
      }
      if (pattern.repeats !== null && played >= pattern.repeats && interval) {
        clearInterval(interval)
        interval = undefined
      }
    }

    playTone()
    if (pattern.repeats === null || pattern.repeats > 1) {
      interval = setInterval(playTone, periodMs)
    }

    return () => {
      stopped = true
      if (interval) {
        clearInterval(interval)
      }
      ctx.close().catch(() => undefined)
    }
  }, [active, mode, restartKey])
}
