"use client"

import { useEffect } from "react"

/**
 * Classic North-American outgoing-ringback pair of frequencies (Hz) — kept
 * distinct from `RING_FREQUENCIES` in `use-voip-ringtone.ts` (the incoming
 * ring) so an agent can tell the two apart by ear alone.
 */
const RINGBACK_FREQUENCIES = [440, 480] as const
/** One ringback burst lasts this long, then a gap, then it repeats — a
 * shorter duty cycle than the incoming ring, mirroring a real dial tone. */
const RINGBACK_DURATION_S = 2
const RINGBACK_GAP_S = 4
const RINGBACK_PERIOD_MS = (RINGBACK_DURATION_S + RINGBACK_GAP_S) * 1000
/** Kept low so the tone is audible but never startling / clipping. */
const RINGBACK_GAIN = 0.12

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

/**
 * Plays a soft, repeating outgoing-call ringback tone (synthesized with the
 * Web Audio API — no audio asset to bundle or fetch) for as long as `active`
 * is true, stopping and releasing the audio context when it turns false or
 * the component unmounts. This is the outbound counterpart to
 * `useVoipRingtone` — mount it only where the outbound dialing/ringing UI
 * lives, driven by the store's `outboundDialing`/`outboundRinging` phases,
 * so it never doubles up with the incoming ringtone. Same autoplay/teardown
 * discipline as `useVoipRingtone`: the agent is already interacting with the
 * inbox (they just clicked Call), so the audio context resumes without a
 * fresh gesture, and a browser that still blocks it silently skips the tone
 * rather than throwing.
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
