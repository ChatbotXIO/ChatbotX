import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  useVoipRingtone,
  type VoipRingtoneMode,
} from "@/features/integration-whatsapp/calling/voip/use-voip-ringtone"

// This file is `.ts`, not `.tsx` — the harness below is built with
// `createElement` instead of JSX so the TypeScript (non-JSX) esbuild loader
// can parse it.

/**
 * `useVoipRingtone` synthesizes its tones with the raw Web Audio API rather
 * than an audio asset, and every OTHER test in the codebase mocks this hook
 * — so its actual scheduling logic (`TONE_PATTERN_BY_MODE`, the repeat
 * interval, the gain envelope) has never run inside a test before. These
 * stubs record every oscillator/gain node the hook creates and every call
 * made on them, so the assertions below check what the hook ACTUALLY
 * schedules against real numbers read from the hook's own
 * `TONE_PATTERN_BY_MODE` table, not invented ones.
 */

type RecordedGainCall = {
  method: "setValueAtTime" | "linearRampToValueAtTime"
  value: number
  time: number
}

class StubAudioParam {
  calls: RecordedGainCall[] = []
  setValueAtTime(value: number, time: number) {
    this.calls.push({ method: "setValueAtTime", value, time })
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push({ method: "linearRampToValueAtTime", value, time })
  }
}

class StubGainNode {
  gain = new StubAudioParam()
  connect = vi.fn()
}

class StubOscillatorNode {
  type = ""
  frequency = { value: 0 }
  startedAt: number | undefined
  stoppedAt: number | undefined
  connectedGain: StubGainNode | undefined
  connect(node: StubGainNode) {
    this.connectedGain = node
    return node
  }
  start(time: number) {
    this.startedAt = time
  }
  stop(time: number) {
    this.stoppedAt = time
  }
}

class StubAudioContext {
  currentTime = 0
  destination = {}
  oscillators: StubOscillatorNode[] = []
  gains: StubGainNode[] = []
  closeMock = vi.fn().mockResolvedValue(undefined)

  constructor() {
    createdAudioContexts.push(this)
  }

  createOscillator() {
    const oscillator = new StubOscillatorNode()
    this.oscillators.push(oscillator)
    return oscillator
  }

  createGain() {
    const gain = new StubGainNode()
    this.gains.push(gain)
    return gain
  }

  resume() {
    return Promise.resolve()
  }

  close() {
    return this.closeMock()
  }
}

let createdAudioContexts: StubAudioContext[] = []

describe("useVoipRingtone", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    createdAudioContexts = []
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal("AudioContext", StubAudioContext)

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  type HarnessProps = {
    active: boolean
    mode?: VoipRingtoneMode
    restartKey?: number | string
  }

  function Harness({ active, mode, restartKey }: HarnessProps) {
    useVoipRingtone(active, mode, restartKey)
    return null
  }

  const render = (props: HarnessProps) =>
    act(() => {
      root.render(createElement(Harness, props))
    })

  test("ring mode keeps producing tones past its second period — it repeats until stopped", async () => {
    render({ active: true, mode: "ring" })

    // The classic ring pair (440Hz + 480Hz) plays immediately on mount.
    const ctx = createdAudioContexts[0]
    expect(ctx).toBeDefined()
    if (!ctx) {
      return
    }
    expect(ctx.oscillators).toHaveLength(2)

    // period = (durationS + gapS) * 1000 = (1 + 2) * 1000 = 3000ms. Advance
    // past TWO full periods (6000ms) — a finite pattern (like callWaiting)
    // would have stopped scheduling by now, but `ring`'s `repeats: null`
    // means it must still be going: a third tone (2 more oscillators) fires
    // at the 6000ms mark. This would FAIL (stay at 2 oscillators) against a
    // version of the hook that only played the tone once, or that treated
    // `repeats: null` as "stop after one period" instead of "never stop".
    await act(async () => {
      vi.advanceTimersByTime(6001)
      await Promise.resolve()
    })

    expect(ctx.oscillators.length).toBeGreaterThanOrEqual(6)
  })

  test("callWaiting mode produces exactly 2 tones and then stops, clearing its interval", async () => {
    render({ active: true, mode: "callWaiting" })

    const ctx = createdAudioContexts[0]
    expect(ctx).toBeDefined()
    if (!ctx) {
      return
    }
    // First beep plays immediately (single 440Hz oscillator — callWaiting
    // has only one frequency).
    expect(ctx.oscillators).toHaveLength(1)

    // period = (0.25 + 0.25) * 1000 = 500ms — the second (and final) beep.
    await act(async () => {
      vi.advanceTimersByTime(501)
      await Promise.resolve()
    })
    expect(ctx.oscillators).toHaveLength(2)

    // If the interval were never cleared after the 2nd beep, advancing far
    // past a 3rd period would add a 3rd oscillator. This assertion would
    // FAIL (oscillator count > 2) against a version of the hook that forgot
    // to `clearInterval` once `played >= pattern.repeats`.
    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(ctx.oscillators).toHaveLength(2)
  })

  test("the call-waiting tone is quieter and shorter than the ring", async () => {
    render({ active: true, mode: "ring" })
    const ringCtx = createdAudioContexts[0]
    expect(ringCtx).toBeDefined()
    if (!ringCtx) {
      return
    }
    const ringOscillator = ringCtx.oscillators[0]
    const ringGain = ringOscillator?.connectedGain
    expect(ringOscillator?.startedAt).toBeDefined()
    expect(ringOscillator?.stoppedAt).toBeDefined()
    // Duration is read straight off `stop - start`, not asserted against an
    // invented literal — this is exactly the hook's own `durationS`.
    const ringDurationS =
      (ringOscillator?.stoppedAt ?? 0) - (ringOscillator?.startedAt ?? 0)
    const ringPeakGain = ringGain?.gain.calls.find(
      (call) => call.method === "linearRampToValueAtTime" && call.value > 0,
    )?.value

    act(() => root.render(null))
    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    render({ active: true, mode: "callWaiting" })
    const waitingCtx = createdAudioContexts.at(-1)
    expect(waitingCtx).toBeDefined()
    if (!waitingCtx) {
      return
    }
    const waitingOscillator = waitingCtx.oscillators[0]
    const waitingGain = waitingOscillator?.connectedGain
    const waitingDurationS =
      (waitingOscillator?.stoppedAt ?? 0) - (waitingOscillator?.startedAt ?? 0)
    const waitingPeakGain = waitingGain?.gain.calls.find(
      (call) => call.method === "linearRampToValueAtTime" && call.value > 0,
    )?.value

    // This would FAIL against a version that used the SAME pattern for both
    // modes (e.g. reusing the ring's gain/duration for callWaiting) — the
    // two numbers would be equal instead of waiting < ring on both axes.
    expect(waitingPeakGain).toBeLessThan(
      ringPeakGain ?? Number.POSITIVE_INFINITY,
    )
    expect(waitingDurationS).toBeLessThan(ringDurationS)
  })

  test("unmounting closes the AudioContext and schedules no further tones", async () => {
    render({ active: true, mode: "ring" })
    const ctx = createdAudioContexts[0]
    expect(ctx).toBeDefined()
    if (!ctx) {
      return
    }
    const oscillatorCountBeforeUnmount = ctx.oscillators.length

    act(() => root.unmount())

    expect(ctx.closeMock).toHaveBeenCalled()

    // A version of the hook that forgot to `clearInterval` in its cleanup
    // would keep firing `playTone` on the now-unmounted component's stale
    // closure — this would FAIL (oscillator count growing) in that case.
    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
    })
    expect(ctx.oscillators.length).toBe(oscillatorCountBeforeUnmount)

    // Re-create the root so the shared `afterEach` unmount is a harmless
    // no-op against an already-unmounted tree.
    container.remove()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  test("active: false schedules nothing at all", async () => {
    render({ active: false, mode: "ring" })

    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
    })

    // No AudioContext was ever constructed — this would FAIL (length > 0)
    // against a version of the hook that built the context unconditionally
    // and only gated playback, rather than gating the whole effect body on
    // `active`.
    expect(createdAudioContexts).toHaveLength(0)
  })
})
