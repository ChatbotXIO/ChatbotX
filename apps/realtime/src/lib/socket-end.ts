/** Minimal shape of a uWS WebSocket that can be ended with a close frame. */
export type EndableSocket = {
  end: (code?: number, reason?: string) => void
}

/** Ends requested while `runThenFlushEnds` runs; undefined outside it. */
let deferredEnds: Array<() => void> | undefined

/**
 * Ends a socket with a close frame — or, while an upgrade is still corked,
 * right after the cork is released.
 *
 * uWS calls `open` synchronously inside `res.upgrade()`, which the gateway
 * runs inside `res.cork()`. An `end()` issued there writes the close frame but
 * cannot shut the TCP connection down while the socket is corked, so the
 * client (which waits for the server to close the connection after the close
 * handshake) only sees `onclose` once uWS times the socket out ~16s later. A
 * resync or overload close on open would delay every reconnect by that much.
 */
export const endSocket = (
  socket: EndableSocket,
  code: number,
  reason: string,
): void => {
  if (deferredEnds) {
    deferredEnds.push(() => socket.end(code, reason))
    return
  }
  socket.end(code, reason)
}

/**
 * Runs `work` (a corked upgrade), then performs every `endSocket` it requested
 * once the cork has been released.
 */
export const runThenFlushEnds = (work: () => void): void => {
  const ends: Array<() => void> = []
  deferredEnds = ends
  try {
    work()
  } finally {
    deferredEnds = undefined
    for (const end of ends) {
      try {
        end()
      } catch {
        // uWS throws on a socket it has already invalidated (the peer went
        // away during the upgrade); there is nothing left to end.
      }
    }
  }
}
