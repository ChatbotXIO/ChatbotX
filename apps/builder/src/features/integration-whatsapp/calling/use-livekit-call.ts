"use client"

import { type RemoteTrack, Room, RoomEvent, Track } from "livekit-client"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Minimal audio-only LiveKit session for in-app WhatsApp calls: connects,
 * publishes the microphone, and plays every remote audio track through
 * detached <audio> elements. One session at a time.
 */
export function useLivekitCall() {
  const roomRef = useRef<Room | null>(null)
  const audioElementsRef = useRef<HTMLMediaElement[]>([])
  const [isMuted, setIsMutedState] = useState(false)

  const cleanupAudio = useCallback(() => {
    for (const element of audioElementsRef.current) {
      element.remove()
    }
    audioElementsRef.current = []
  }, [])

  const disconnect = useCallback(async () => {
    const room = roomRef.current
    roomRef.current = null
    cleanupAudio()
    setIsMutedState(false)
    if (room) {
      await room.disconnect()
    }
  }, [cleanupAudio])

  const connect = useCallback(
    async (url: string, token: string) => {
      await disconnect()

      const room = new Room()
      roomRef.current = room

      const attachTrack = (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) {
          return
        }
        const element = track.attach()
        element.style.display = "none"
        document.body.append(element)
        audioElementsRef.current.push(element)
      }

      room.on(RoomEvent.TrackSubscribed, attachTrack)
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const element of track.detach()) {
          element.remove()
          audioElementsRef.current = audioElementsRef.current.filter(
            (kept) => kept !== element,
          )
        }
      })

      await room.connect(url, token)
      await room.localParticipant.setMicrophoneEnabled(true)

      // Tracks published before we subscribed are attached on join.
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.track) {
            attachTrack(publication.track as RemoteTrack)
          }
        }
      }
    },
    [disconnect],
  )

  const setMuted = useCallback(async (muted: boolean) => {
    const room = roomRef.current
    if (!room) {
      return
    }
    await room.localParticipant.setMicrophoneEnabled(!muted)
    setIsMutedState(muted)
  }, [])

  useEffect(
    () => () => {
      disconnect().catch(() => {
        /* already disconnected */
      })
    },
    [disconnect],
  )

  return { connect, disconnect, setMuted, isMuted }
}
