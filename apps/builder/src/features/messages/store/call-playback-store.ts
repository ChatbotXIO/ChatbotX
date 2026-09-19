"use client"

import { create } from "zustand"

/**
 * A single global <audio> element (lazily created, browser-only) — the one
 * playback owner shared by the progressive call card and the Call Information
 * sheet, so the two never fight over playback. Module-scoped rather than
 * Zustand state, since an HTMLAudioElement isn't serializable state.
 */
let sharedAudioElement: HTMLAudioElement | null = null

const getSharedAudioElement = (): HTMLAudioElement => {
  sharedAudioElement ??= new Audio()
  return sharedAudioElement
}

export type CallPlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "error"

export type CallPlaybackState = {
  /**
   * The WhatsappCall.id currently loaded into the shared audio element, if any.
   */
  callId: string | null
  status: CallPlaybackStatus
  currentTime: number
  duration: number
  volume: number
}

export type CallPlaybackActions = {
  /**
   * Plays callId's recording, resolving a (possibly freshly re-signed) playback
   * URL — called again automatically on retry after a playback error. Switching
   * to a different callId stops whatever the shared element was playing first,
   * so only one call ever plays at a time.
   */
  play: (callId: string, resolveUrl: () => Promise<string>) => Promise<void>
  pause: () => void
  toggle: (callId: string, resolveUrl: () => Promise<string>) => Promise<void>
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  /**
   * Stops and detaches the shared <audio> element and resets playback state —
   * called when the inbox unmounts so a recording never keeps playing after the
   * user navigates away.
   */
  reset: () => void
}

export type CallPlaybackStore = CallPlaybackState & CallPlaybackActions

export const useCallPlaybackStore = create<CallPlaybackStore>((set, get) => ({
  callId: null,
  status: "idle",
  currentTime: 0,
  duration: 0,
  volume: 1,

  play: async (callId, resolveUrl) => {
    const audio = getSharedAudioElement()
    const isSameCallAlreadyLoaded = get().callId === callId

    if (!isSameCallAlreadyLoaded) {
      audio.pause()
      set({ callId, status: "loading", currentTime: 0, duration: 0 })

      // Ogg/Opus and MediaRecorder blobs are routinely written without a
      // duration in the container header, so the browser reports audio.duration
      // === Infinity at loadedmetadata (the "0:00 / 0:00" bug). Seeking far
      // past the end forces a scan to the real end and a finite durationchange,
      // after which we restore the position. isProbingDuration suppresses the
      // transient timeupdate spikes the probe seek produces.
      let isProbingDuration = false
      const applyDuration = () => {
        if (get().callId !== callId) {
          return
        }
        if (Number.isFinite(audio.duration)) {
          set({ duration: audio.duration })
          if (isProbingDuration) {
            isProbingDuration = false
            audio.currentTime = 0
          }
        } else if (!isProbingDuration) {
          isProbingDuration = true
          audio.currentTime = 1e101
        }
      }

      audio.ontimeupdate = () => {
        if (get().callId === callId && !isProbingDuration) {
          set({ currentTime: audio.currentTime })
        }
      }
      audio.onloadedmetadata = applyDuration
      audio.ondurationchange = applyDuration
      audio.onended = () => {
        if (get().callId === callId) {
          set({ status: "paused", currentTime: 0 })
        }
      }
      audio.onerror = () => {
        if (get().callId === callId) {
          set({ status: "error" })
        }
      }
    }

    try {
      if (!isSameCallAlreadyLoaded || get().status === "error") {
        set({ status: "loading" })
        audio.src = await resolveUrl()
        audio.volume = get().volume
      }
      await audio.play()
      if (get().callId === callId) {
        set({ status: "playing" })
      }
    } catch {
      if (get().callId === callId) {
        set({ status: "error" })
      }
    }
  },

  pause: () => {
    getSharedAudioElement().pause()
    set({ status: "paused" })
  },

  toggle: async (callId, resolveUrl) => {
    const state = get()
    if (state.callId === callId && state.status === "playing") {
      state.pause()
      return
    }
    await state.play(callId, resolveUrl)
  },

  seek: (seconds) => {
    const audio = getSharedAudioElement()
    audio.currentTime = seconds
    set({ currentTime: seconds })
  },

  setVolume: (volume) => {
    getSharedAudioElement().volume = volume
    set({ volume })
  },

  reset: () => {
    const audio = getSharedAudioElement()
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
    set({ callId: null, status: "idle", currentTime: 0, duration: 0 })
  },
}))
