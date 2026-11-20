import {
  Agent,
  type Response as UndiciResponse,
  fetch as undiciFetch,
} from "undici"

const IP_LITERAL = /^[\d.]+$|:/

/**
 * Node-only (undici), same as `decision/transport`, which the router already
 * reaches. Uses no `node:` import of its own (the Edge-graph guard flags it). Deliberately NOT re-exported from `./index`: import it
 * straight from `../net/pinned-fetch` in server-only code (AGENTS.md
 * invariant 25).
 */

/**
 * A dispatcher whose sockets always connect to `address` (an already
 * SSRF-validated public IP) while TLS SNI and the HTTP Host header keep the
 * original hostname — so a second, attacker-influenced DNS lookup at connect
 * time (DNS rebinding) can never redirect the request to a private address.
 *
 * The pin is a `lookup` function, not `connect.host`: undici's connector
 * spreads the connect options and then overwrites `host` with the request
 * hostname, but passes `lookup` through to `net.connect` / `tls.connect`.
 */
export const createPinnedDispatcher = (
  address: string,
  hostname: string,
): Agent => {
  const family = address.includes(":") ? 6 : 4
  const lookup = (
    _hostname: string,
    options: { all?: boolean },
    callback: (
      error: Error | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ): void => {
    if (options.all) {
      callback(null, [{ address, family }])
      return
    }
    callback(null, address, family)
  }
  return new Agent({
    connect: {
      lookup,
      // SNI must be a DNS name; an IP literal is dialled as-is.
      ...(IP_LITERAL.test(hostname) ? {} : { servername: hostname }),
    },
  })
}

/** Wraps an undici response as a platform `Response`. */
export const toWebResponse = (
  response: UndiciResponse,
  onSettled?: () => void,
): Response => {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    headers.append(key, value)
  })
  const reader = response.body?.getReader()
  const body = reader
    ? new ReadableStream<Uint8Array>({
        async cancel(reason) {
          try {
            await reader.cancel(reason)
          } finally {
            onSettled?.()
          }
        },
        async pull(controller) {
          try {
            const { done, value } = await reader.read()
            if (done) {
              controller.close()
              onSettled?.()
              return
            }
            if (!(value instanceof Uint8Array)) {
              controller.error(new Error("Pinned fetch returned invalid body"))
              onSettled?.()
              return
            }
            controller.enqueue(value)
          } catch (error) {
            onSettled?.()
            throw error
          }
        },
      })
    : null

  if (!reader) {
    onSettled?.()
  }

  return new Response(body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

/**
 * GETs `url` over a connection pinned to `address`, never following
 * redirects. The dispatcher is closed (once) when the body is fully read or
 * cancelled, or when the request fails or is aborted.
 */
export const pinnedGet = async (input: {
  address: string
  signal?: AbortSignal
  url: string
}): Promise<Response> => {
  const dispatcher = createPinnedDispatcher(
    input.address,
    new URL(input.url).hostname,
  )
  let isClosed = false
  const dispose = (): void => {
    if (isClosed) {
      return
    }
    isClosed = true
    input.signal?.removeEventListener("abort", dispose)
    dispatcher.close().catch(() => undefined)
  }
  input.signal?.addEventListener("abort", dispose, { once: true })
  try {
    const response = await undiciFetch(input.url, {
      dispatcher,
      method: "GET",
      redirect: "manual",
      signal: input.signal,
    })
    // Close the per-request pool once the body is consumed or abandoned.
    return toWebResponse(response, dispose)
  } catch (error) {
    dispose()
    throw error
  }
}
