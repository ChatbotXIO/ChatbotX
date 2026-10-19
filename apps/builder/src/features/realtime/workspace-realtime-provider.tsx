"use client"

import {
  createRealtimeFrameReader,
  REALTIME_CLOSE_CODE,
  type RealtimeTargetedEventData as RealtimeEventData,
  RealtimeEventType,
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
import { logger } from "@/lib/log"
import { client } from "@/lib/orpc/orpc"
import { REALTIME_EVENT_SCHEMAS } from "./realtime-event-validation"
import { decideRealtimeWarnLogging } from "./realtime-warn-limiter"
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

const logRealtimeWarning = ({
  error,
  eventType,
  message,
  reason,
  suppressionMessage,
}: {
  error: unknown
  eventType?: RealtimeEventName
  message: string
  reason: string
  suppressionMessage: string
}): void => {
  const decision = decideRealtimeWarnLogging(reason, eventType)
  if (!decision.shouldLog) {
    return
  }

  logger.warn(
    {
      err: error,
      ...(eventType ? { eventType } : {}),
      suppressed: decision.isSuppressionSummary,
    },
    decision.isSuppressionSummary ? suppressionMessage : message,
  )
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
  const hasOpenedOnceRef = useRef(false)

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
      onResyncNeeded: handleResync,
      schema: realtimeMemberBatchEnvelopeSchema,
    })
  }
  useEffect(() => {
    frameReaderRef.current?.reset()
    hasOpenedOnceRef.current = false
  }, [])

  const getSocketUrl = useCallback(async (): Promise<string> => {
    const { token } =
      await client.realtimeAPI.mintWorkspaceConnectTokenAuthenticatedAPI({
        workspaceId,
      })
    const url = new URL(
      `rt/workspaces/${encodeURIComponent(workspaceId)}`,
      publicRealtimeUrl,
    )
    url.searchParams.set("token", token)
    const lastSeq = frameReaderRef.current?.getLastSeq()
    if (lastSeq) {
      url.searchParams.set("lastSeq", lastSeq)
    }
    return url.toString()
  }, [publicRealtimeUrl, workspaceId])

  useRealtimeSocket({
    connectionKey: `${publicRealtimeUrl}:${workspaceId}`,
    getUrl: getSocketUrl,
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
      setStatus("open")
    },
    onResync: handleResync,
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
    () => ({ reconnectCount, status, subscribeHandlers }),
    [reconnectCount, status, subscribeHandlers],
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
