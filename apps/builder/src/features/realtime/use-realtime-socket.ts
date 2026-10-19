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

    return () => {
      socket.close()
    }
  }, [connectionKey])
}
