"use client"

import { RealtimeSocket } from "@chatbotx.io/realtime-protocol"
import { useEffect, useRef } from "react"

type RealtimeSocketOptions = ConstructorParameters<typeof RealtimeSocket>[0]

type UseRealtimeSocketOptions = RealtimeSocketOptions & {
  connectionKey: string
}

/**
 * Owns one native realtime socket for a React component. Callback refs keep
 * reconnects pointed at the latest state without recreating the transport.
 */
export const useRealtimeSocket = ({
  connectionKey,
  ...options
}: UseRealtimeSocketOptions): void => {
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (connectionKey.length === 0) {
      return
    }

    const socket = new RealtimeSocket({
      ...optionsRef.current,
      getUrl: () => optionsRef.current.getUrl(),
      onClose: (event) => optionsRef.current.onClose?.(event),
      onError: (error) => optionsRef.current.onError?.(error),
      onMessage: (data) => optionsRef.current.onMessage(data),
      onOpen: () => optionsRef.current.onOpen?.(),
      onResync: () => optionsRef.current.onResync?.(),
    })
    socket.connect()

    // The reconnect backoff only resets after sustained uptime, so after a
    // run of short connections the next attempt can be up to 30s away. Coming
    // back online or to the tab retries at once instead; `reconnectNow` is a
    // no-op while connected and still honours a server overload retryAfter.
    const reconnectWhenVisible = (): void => {
      if (document.visibilityState === "visible") {
        socket.reconnectNow()
      }
    }
    window.addEventListener("online", socket.reconnectNow)
    document.addEventListener("visibilitychange", reconnectWhenVisible)

    return () => {
      window.removeEventListener("online", socket.reconnectNow)
      document.removeEventListener("visibilitychange", reconnectWhenVisible)
      socket.close()
    }
  }, [connectionKey])
}
