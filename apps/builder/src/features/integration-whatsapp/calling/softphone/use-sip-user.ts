"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SimpleUser } from "sip.js/lib/platform/web/index.js"
import { useWorkspaceId } from "@/hooks/routing"
import { getSoftphoneCredentialsAction } from "../actions/softphone-credentials.action"

/** Root-uuid INVITE header the responder stamps on every outbound leg. */
const ROOT_UUID_HEADER = "X-CBX-Root-UUID"
/**
 * `softphoneCredentialService.issueCredentials` mints an 8h SIP digest
 * password. The service does not return an expiry timestamp, so
 * this hook re-issues on the same fixed cadence, minus a safety margin, so
 * the softphone never rides a credential past expiry.
 */
const CREDENTIAL_TTL_MS = 8 * 60 * 60 * 1000
const CREDENTIAL_REFRESH_MARGIN_MS = 10 * 60 * 1000

export type SipUserCallHandlers = {
  onCallReceived?: (info: { rootUuid: string | null }) => void
  onCallAnswered?: () => void
  onCallHangup?: () => void
  onRegistered?: () => void
  onUnregistered?: () => void
  onServerDisconnect?: (error?: Error) => void
}

/**
 * One `SimpleUser` per open workspace: registers on the
 * workspace's pinned FreeSWITCH node using credentials minted by
 * `getSoftphoneCredentialsAction`, re-issues them before they expire, and
 * exposes `call`/`answer`/`decline`/`hangup`/`mute`.
 *
 * Reading the `X-CBX-Root-UUID` header off an incoming INVITE requires
 * reaching past `SimpleUser`'s public surface — its `session` field is
 * private in the published `.d.ts` but present at runtime (SIP.js does not
 * strip it), and there is no supported public accessor for the underlying
 * `Invitation`/`Inviter` in this version. The cast below is narrow and
 * isolated to this one read.
 */
export function useSipUser(handlers: SipUserCallHandlers = {}) {
  const workspaceId = useWorkspaceId()
  const simpleUserRef = useRef<SimpleUser | null>(null)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const readIncomingRootUuid = useCallback((): string | null => {
    const user = simpleUserRef.current as unknown as {
      session?: {
        incomingInviteRequest?: {
          message?: { getHeader?: (n: string) => string | undefined }
        }
      }
    } | null
    const header =
      user?.session?.incomingInviteRequest?.message?.getHeader?.(
        ROOT_UUID_HEADER,
      )
    return header ?? null
  }, [])

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = null
    }
  }, [])

  const disconnect = useCallback(async () => {
    clearRefreshTimer()
    const user = simpleUserRef.current
    simpleUserRef.current = null
    setIsRegistered(false)
    if (user) {
      await user.disconnect().catch(() => undefined)
    }
  }, [clearRefreshTimer])

  const scheduleRefresh = useCallback(
    (expiresAt: number, connectFn: () => Promise<void>) => {
      clearRefreshTimer()
      const delay = Math.max(
        0,
        expiresAt - Date.now() - CREDENTIAL_REFRESH_MARGIN_MS,
      )
      refreshTimeoutRef.current = setTimeout(() => {
        connectFn().catch(() => undefined)
      }, delay)
    },
    [clearRefreshTimer],
  )

  const connect = useCallback(async () => {
    if (!workspaceId) {
      return
    }
    const credentials = await getSoftphoneCredentialsAction(workspaceId)
    const data = credentials?.data
    if (!data) {
      return
    }

    await disconnect()

    const user = new SimpleUser(data.wssUrl, {
      aor: `sip:${data.sipUsername}@${data.sipDomain}`,
      userAgentOptions: {
        authorizationUsername: data.sipUsername,
        authorizationPassword: data.password,
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: [
              {
                urls: data.turn.urls,
                username: data.turn.username,
                credential: data.turn.credential,
              },
            ],
          },
        },
      },
      media: { constraints: { audio: true, video: false } },
      delegate: {
        onCallReceived: () => {
          handlersRef.current.onCallReceived?.({
            rootUuid: readIncomingRootUuid(),
          })
        },
        onCallAnswered: () => handlersRef.current.onCallAnswered?.(),
        onCallHangup: () => handlersRef.current.onCallHangup?.(),
        onRegistered: () => {
          setIsRegistered(true)
          handlersRef.current.onRegistered?.()
        },
        onUnregistered: () => {
          setIsRegistered(false)
          handlersRef.current.onUnregistered?.()
        },
        onServerDisconnect: (error) =>
          handlersRef.current.onServerDisconnect?.(error),
      },
    })
    simpleUserRef.current = user

    await user.connect()
    await user.register()

    scheduleRefresh(Date.now() + CREDENTIAL_TTL_MS, connect)
  }, [workspaceId, disconnect, readIncomingRootUuid, scheduleRefresh])

  // Reconnects only when the workspace changes — `connect`/`disconnect` are
  // stable for a given workspaceId (both are recreated from it), so
  // including them would just re-run this effect on every render without
  // changing behavior.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    connect().catch(() => undefined)
    return () => {
      disconnect().catch(() => undefined)
    }
  }, [workspaceId])

  const call = useCallback(async (dialUri: string, attemptId: string) => {
    const user = simpleUserRef.current
    if (!user) {
      throw new Error("softphone-not-registered")
    }
    await user.call(dialUri, undefined, {
      requestOptions: {
        extraHeaders: [`X-CBX-Attempt: ${attemptId}`],
      },
    })
  }, [])

  const answer = useCallback(async () => {
    await simpleUserRef.current?.answer()
  }, [])

  const decline = useCallback(async () => {
    await simpleUserRef.current?.decline()
  }, [])

  const hangup = useCallback(async () => {
    await simpleUserRef.current?.hangup()
  }, [])

  const setMuted = useCallback((muted: boolean) => {
    const user = simpleUserRef.current
    if (!user) {
      return
    }
    if (muted) {
      user.mute()
    } else {
      user.unmute()
    }
    setIsMuted(muted)
  }, [])

  return {
    isRegistered,
    isMuted,
    call,
    answer,
    decline,
    hangup,
    setMuted,
  }
}
