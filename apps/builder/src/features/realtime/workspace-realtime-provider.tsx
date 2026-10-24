"use client"

import {
  createRealtimeFrameReader,
  REALTIME_CLOSE_CODE,
  type RealtimeTargetedEventData as RealtimeEventData,
  RealtimeEventType,
  RealtimeFatalError,
  type RealtimeFrameReader,
  realtimeMemberBatchEnvelopeSchema,
} from "@chatbotx.io/realtime-protocol"
import { useQueryClient } from "@tanstack/react-query"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTenantSettings } from "@/features/tenant"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import { REALTIME_EVENT_SCHEMAS } from "./realtime-event-validation"
import { logRealtimeWarning } from "./realtime-warn-limiter"
import type {
  RealtimeEvent,
  RealtimeEventName,
  RealtimeHandlerMap,
} from "./types"
import { useRealtimeSocket } from "./use-realtime-socket"

export type WorkspaceRealtimeConnectionStatus =
  | "connecting"
  | "open"
  | "closed"
  | "revoked"

type MemberRealtimeEnvelope = {
  data: unknown
  eventType: string
}

const KNOWN_REALTIME_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(RealtimeEventType),
)

const isKnownRealtimeEventName = (value: string): value is RealtimeEventName =>
  KNOWN_REALTIME_EVENT_NAMES.has(value)

type ErasedRealtimeListener = (event: RealtimeEventData) => void

const isRealtimeAuthorizationError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false
  }

  const { status } = error as { status?: unknown }
  return status === 401 || status === 403
}

export type WorkspaceRealtimeSubscribe = <K extends RealtimeEventName>(
  eventType: K,
  listener: (event: RealtimeEvent<K>) => void,
) => () => void

type WorkspaceRealtimeContextValue = {
  subscribeHandlers: (
    eventTypes: RealtimeEventName[],
    getHandlers: () => RealtimeHandlerMap,
  ) => () => void
  status: WorkspaceRealtimeConnectionStatus
  reconnectCount: number
  /**
   * Bumps when the gateway could not replay what this client missed, so state
   * fed only by realtime events (such as an incoming call's ring or an outbound
   * call's SDP answer) must be reloaded from the server. It only changes on a
   * live socket, never while it is down: at once for a bad frame, or after the
   * socket reopens following a server resync, so a reload cannot race the
   * events published before reconnect.
   */
  resyncCount: number
}

const WorkspaceRealtimeContext =
  createContext<WorkspaceRealtimeContextValue | null>(null)

const invokeErasedHandler = (
  handler: unknown,
  event: RealtimeEventData,
): void => {
  if (typeof handler !== "function") {
    return
  }
  ;(handler as ErasedRealtimeListener)(event)
}

export function WorkspaceRealtimeProvider({
  children,
}: {
  children: ReactNode
}) {
  const workspaceId = useWorkspaceId()
  const { publicRealtimeUrl } = useTenantSettings()
  const queryClient = useQueryClient()
  const listenersRef = useRef(
    new Map<RealtimeEventName, Set<ErasedRealtimeListener>>(),
  )
  const frameReaderRef =
    useRef<RealtimeFrameReader<MemberRealtimeEnvelope> | null>(null)
  const [status, setStatus] =
    useState<WorkspaceRealtimeConnectionStatus>("connecting")
  const [reconnectCount, setReconnectCount] = useState(0)
  const [resyncCount, setResyncCount] = useState(0)
  const hasOpenedOnceRef = useRef(false)
  // A server resync closes the socket and resets the replay cursor; the reload
  // signal waits for the reconnect so no event lands in the gap.
  const isResyncPendingReopenRef = useRef(false)

  useEffect(
    () => () => {
      hasOpenedOnceRef.current = false
    },
    [],
  )

  const invalidateRealtimeCaches = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries()
  }, [queryClient])

  const handleResync = useCallback(async (): Promise<void> => {
    frameReaderRef.current?.reset()
    await invalidateRealtimeCaches()
  }, [invalidateRealtimeCaches])

  // A bad frame is detected on a live socket, so the reload signal is immediate
  // and does not wait for the cache refetches: a slow, unrelated query must not
  // delay recovery of a missed ring until its short deadline passes.
  const handleFrameResync = useCallback((): void => {
    setResyncCount((count) => count + 1)
    handleResync()
  }, [handleResync])

  const handleSocketResync = useCallback(async (): Promise<void> => {
    isResyncPendingReopenRef.current = true
    await handleResync()
  }, [handleResync])

  const processRealtimeFrame = useCallback(
    ({ data, eventType: eventTypeString }: MemberRealtimeEnvelope): void => {
      if (!isKnownRealtimeEventName(eventTypeString)) {
        return
      }

      const eventType = eventTypeString
      const schema = REALTIME_EVENT_SCHEMAS[eventType]
      if (schema) {
        const result = schema.safeParse(data)
        if (!result.success) {
          logRealtimeWarning({
            error: result.error,
            eventType,
            message: "Workspace realtime: event failed schema validation",
            reason: "schema-invalid",
            suppressionMessage:
              "Workspace realtime: further schema-validation warnings suppressed for this window",
          })
          frameReaderRef.current?.reportInvalidEvent()
          return
        }
      }

      const listeners = listenersRef.current.get(eventType)
      if (!listeners || listeners.size === 0) {
        return
      }

      const event = { data, eventType } as RealtimeEventData
      for (const listener of listeners) {
        try {
          listener(event)
        } catch (error) {
          logRealtimeWarning({
            error,
            eventType,
            message:
              "Workspace realtime: a listener threw while handling an event",
            reason: "listener-threw",
            suppressionMessage:
              "Workspace realtime: further listener-threw warnings suppressed for this window",
          })
        }
      }
    },
    [],
  )

  if (!frameReaderRef.current) {
    frameReaderRef.current = createRealtimeFrameReader({
      onParseError: (error) => {
        logRealtimeWarning({
          error,
          message: "Workspace realtime: invalid batch frame",
          reason: "invalid-batch",
          suppressionMessage:
            "Workspace realtime: further invalid-batch warnings suppressed for this window",
        })
      },
      onResyncNeeded: handleFrameResync,
      schema: realtimeMemberBatchEnvelopeSchema,
    })
  }
  useEffect(() => {
    frameReaderRef.current?.reset()
    hasOpenedOnceRef.current = false
    isResyncPendingReopenRef.current = false
  }, [])

  const getSocketUrl = useCallback(async (): Promise<string> => {
    let token: string
    try {
      ;({ token } =
        await client.realtimeAPI.mintWorkspaceConnectTokenAuthenticatedAPI({
          workspaceId,
        }))
    } catch (error) {
      if (isRealtimeAuthorizationError(error)) {
        throw new RealtimeFatalError("Workspace realtime authorization revoked")
      }
      throw error
    }

    const url = new URL(
      `rt/workspaces/${encodeURIComponent(workspaceId)}`,
      publicRealtimeUrl,
    )
    url.searchParams.set("token", token)
    const lastSeq = frameReaderRef.current?.getLastSeq()
    if (lastSeq) {
      url.searchParams.set("lastSeq", lastSeq)
    } else if (hasOpenedOnceRef.current) {
      // A reconnect with no cursor asks for no replay, so the gateway cannot
      // tell this client missed anything and will not close it with a resync.
      isResyncPendingReopenRef.current = true
    }
    return url.toString()
  }, [publicRealtimeUrl, workspaceId])

  const handleSocketError = useCallback((error: unknown): void => {
    const revoked = error instanceof RealtimeFatalError
    logRealtimeWarning({
      error,
      message: "Workspace realtime: socket connection failed",
      reason: revoked ? "socket-revoked" : "socket-error",
      suppressionMessage: revoked
        ? "Workspace realtime: further revoked socket warnings suppressed for this window"
        : "Workspace realtime: further socket connection warnings suppressed for this window",
    })
    setStatus(revoked ? "revoked" : "closed")
  }, [])

  useRealtimeSocket({
    connectionKey: `${publicRealtimeUrl}:${workspaceId}`,
    getUrl: getSocketUrl,
    onError: handleSocketError,
    onClose: (event) => {
      setStatus(
        event.code === REALTIME_CLOSE_CODE.revoked ? "revoked" : "closed",
      )
    },
    onMessage: (data) => {
      const frames = frameReaderRef.current?.readFrame(data)
      if (!frames) {
        return
      }
      for (const frame of frames) {
        processRealtimeFrame(frame)
      }
    },
    onOpen: () => {
      if (hasOpenedOnceRef.current) {
        setReconnectCount((count) => count + 1)
      }
      hasOpenedOnceRef.current = true
      if (isResyncPendingReopenRef.current) {
        isResyncPendingReopenRef.current = false
        setResyncCount((count) => count + 1)
      }
      setStatus("open")
    },
    onResync: handleSocketResync,
  })

  const subscribe = useCallback<WorkspaceRealtimeSubscribe>(
    (eventType, listener) => {
      const listenersByType = listenersRef.current
      const listeners = listenersByType.get(eventType) ?? new Set()
      listeners.add(listener as unknown as ErasedRealtimeListener)
      listenersByType.set(eventType, listeners)

      return () => {
        listeners.delete(listener as unknown as ErasedRealtimeListener)
        if (listeners.size === 0) {
          listenersByType.delete(eventType)
        }
      }
    },
    [],
  )

  const subscribeHandlers = useCallback(
    (
      eventTypes: RealtimeEventName[],
      getHandlers: () => RealtimeHandlerMap,
    ): (() => void) => {
      const unsubscribes = eventTypes.map((eventType) =>
        subscribe(eventType, (event) => {
          invokeErasedHandler(getHandlers()[eventType], event)
        }),
      )

      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe()
        }
      }
    },
    [subscribe],
  )

  const value = useMemo<WorkspaceRealtimeContextValue>(
    () => ({ reconnectCount, resyncCount, status, subscribeHandlers }),
    [reconnectCount, resyncCount, status, subscribeHandlers],
  )

  return (
    <WorkspaceRealtimeContext.Provider value={value}>
      {children}
    </WorkspaceRealtimeContext.Provider>
  )
}

export function useWorkspaceRealtimeContext(): WorkspaceRealtimeContextValue {
  const context = useContext(WorkspaceRealtimeContext)
  if (!context) {
    throw new Error(
      "useWorkspaceRealtimeContext must be used within a WorkspaceRealtimeProvider",
    )
  }
  return context
}
