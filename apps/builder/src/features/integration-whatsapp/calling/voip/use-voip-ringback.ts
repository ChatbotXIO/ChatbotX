"use client"

import { useEffect } from "react"

/**
 * Classic North-American outgoing-ringback pair of frequencies (Hz) — kept
 * distinct from `RING_FREQUENCIES` (incoming ring) so an agent can tell the two
 * apart by ear alone.
 */
const RINGBACK_FREQUENCIES = [440, 480] as const
/**
 * One ringback burst lasts this long, then a gap, then it repeats — a shorter
 * duty cycle than the incoming ring, mirroring a real dial tone.
 */
const RINGBACK_DURATION_S = 2
const RINGBACK_GAP_S = 4
const RINGBACK_PERIOD_MS = (RINGBACK_DURATION_S + RINGBACK_GAP_S) * 1000
/** Kept low so the tone is audible but never startling / clipping. */
const RINGBACK_GAIN = 0.12

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

/**
 * Outbound counterpart to `useVoipRingtone`. `startOutbound` can dial while an
 * offer sits in the ringing basket, so both hooks' `active` can be true at
 * once — `WhatsappCallPanel` deliberately silences `useVoipRingtone` while
 * this is active so the two tones never sound together.
 */
export function useVoipRingback(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return
    }

    const AudioCtx =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!AudioCtx) {
      return
    }

    const ctx = new AudioCtx()
    ctx.resume().catch(() => undefined)
    let stopped = false

    const playRingback = () => {
      if (stopped) {
        return
      }
      const start = ctx.currentTime + 0.05
      for (const frequency of RINGBACK_FREQUENCIES) {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = "sine"
        oscillator.frequency.value = frequency
        // Short fade in/out so each burst doesn't click.
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(RINGBACK_GAIN, start + 0.05)
        gain.gain.setValueAtTime(
          RINGBACK_GAIN,
          start + RINGBACK_DURATION_S - 0.05,
        )
        gain.gain.linearRampToValueAtTime(0, start + RINGBACK_DURATION_S)
        oscillator.connect(gain).connect(ctx.destination)
        oscillator.start(start)
        oscillator.stop(start + RINGBACK_DURATION_S)
      }
    }

    playRingback()
    const interval = setInterval(playRingback, RINGBACK_PERIOD_MS)

    return () => {
      stopped = true
      clearInterval(interval)
      ctx.close().catch(() => undefined)
    }
  }, [active])
}
