"use client"

import { useEffect } from "react"

/** Classic phone-ring pair of frequencies (Hz). */
const RING_FREQUENCIES = [440, 480] as const
/** One ring lasts this long, then a gap, then it repeats. */
const RING_DURATION_S = 1
const RING_GAP_S = 2
const RING_PERIOD_MS = (RING_DURATION_S + RING_GAP_S) * 1000
/** Kept low so the ring is audible but never startling / clipping. */
const RING_GAIN = 0.14

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

/**
 * Plays a soft, repeating phone ringtone (synthesized with the Web Audio API —
 * no audio asset to bundle or fetch) for as long as `active` is true, stopping
 * and releasing the audio context when it turns false or the component
 * unmounts. Because the agent is already interacting with the inbox, the audio
 * context resumes without a fresh gesture; if the browser still blocks it
 * (autoplay policy on a brand-new context), the ring is silently skipped
 * rather than throwing.
 */
export function useVoipRingtone(active: boolean): void {
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

    const playRing = () => {
      if (stopped) {
        return
      }
      const start = ctx.currentTime + 0.05
      for (const frequency of RING_FREQUENCIES) {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = "sine"
        oscillator.frequency.value = frequency
        // Short fade in/out so each ring doesn't click.
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(RING_GAIN, start + 0.05)
        gain.gain.setValueAtTime(RING_GAIN, start + RING_DURATION_S - 0.05)
        gain.gain.linearRampToValueAtTime(0, start + RING_DURATION_S)
        oscillator.connect(gain).connect(ctx.destination)
        oscillator.start(start)
        oscillator.stop(start + RING_DURATION_S)
      }
    }

    playRing()
    const interval = setInterval(playRing, RING_PERIOD_MS)

    return () => {
      stopped = true
      clearInterval(interval)
      ctx.close().catch(() => undefined)
    }
  }, [active])
}
