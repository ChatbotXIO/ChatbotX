import { request as httpRequest, type IncomingHttpHeaders } from "node:http"
import { request as httpsRequest } from "node:https"
import { isIPv6 } from "node:net"
import { type Readable, Transform } from "node:stream"
import {
  type ImportedMediaFile,
  MediaImportRefusedError,
  type MediaUrlImporter,
} from "@chatbotx.io/business"
import { checkSsrfSafety } from "@chatbotx.io/business/net/ssrf-guard"
import { uploader } from "@chatbotx.io/filesystem"
import { createUpload } from "@chatbotx.io/filesystem/node-upload"
import { logger } from "@/lib/log"

/**
 * Node-only: it opens sockets with `node:https`, so it is registered from the
 * route handlers (`register-media-url-importer.ts`) and never imported from the
 * Edge-traced router graph (AGENTS.md invariant 25).
 */

const MAX_REDIRECT_HOPS = 5
const REDIRECT_STATUS_MIN = 300
const REDIRECT_STATUS_MAX = 399
const OK_STATUS = 200
const USER_AGENT = "ChatbotX-media-import/1.0"
const ACCEPT = "image/*,video/*"
const IPV4_FAMILY = 4
const IPV6_FAMILY = 6

const refused = (message: string): MediaImportRefusedError =>
  new MediaImportRefusedError(message)

type PinnedResponse = {
  headers: IncomingHttpHeaders
  statusCode: number
  stream: Readable
}

/**
 * A `net` lookup that answers with the vetted addresses and never asks DNS.
 * The socket is therefore opened to an address the SSRF guard approved for this
 * URL, while TLS (SNI, certificate name) and the `Host` header keep using the
 * URL's own host name. Handles both lookup call shapes (`all: true` and not).
 */
export const pinnedLookup =
  (addresses: readonly string[]) =>
  (
    _hostname: string,
    options: { all?: boolean },
    callback: (
      error: Error | null,
      address: string | { address: string; family: number }[],
      family?: number,
    ) => void,
  ): void => {
    const entries = addresses.map((address) => ({
      address,
      family: isIPv6(address) ? IPV6_FAMILY : IPV4_FAMILY,
    }))
    const [first] = entries
    if (!first) {
      callback(new Error("no vetted address"), "")
      return
    }
    if (options.all) {
      callback(null, entries)
      return
    }
    callback(null, first.address, first.family)
  }

/** One GET whose socket connects only to `addresses`. */
const pinnedGet = (
  url: URL,
  addresses: readonly string[],
  signal: AbortSignal,
): Promise<PinnedResponse> =>
  new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest
    const request = send(
      url,
      {
        agent: false,
        headers: { accept: ACCEPT, "user-agent": USER_AGENT },
        lookup: pinnedLookup(addresses),
        method: "GET",
        signal,
      },
      (response) =>
        resolve({
          headers: response.headers,
          statusCode: response.statusCode ?? 0,
          stream: response,
        }),
    )
    request.on("error", reject)
    request.end()
  })

const baseMimeType = (value: string | undefined): string =>
  (value ?? "").split(";")[0]?.trim().toLowerCase() ?? ""

/** Counts bytes and fails the pipeline the moment `maxBytes` is crossed. */
const limitedTo = (maxBytes: number): Transform => {
  let total = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      total += chunk.length
      if (total > maxBytes) {
        done(
          refused("The file is larger than the size allowed for URL imports"),
        )
        return
      }
      done(null, chunk)
    },
  })
}

const fileNameOf = (url: URL): string => {
  const last = url.pathname.split("/").pop() ?? ""
  try {
    return decodeURIComponent(last) || "file"
  } catch {
    return "file"
  }
}

const discard = (stream: Readable): void => {
  stream.destroy()
}

export const importMediaFromUrl: MediaUrlImporter = async (input) => {
  let current = input.url
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    // Vetted and requested as one step, per hop: the addresses that passed the
    // guard are the only ones the socket may reach.
    const verdict = await checkSsrfSafety(current)
    if (verdict.unsafe) {
      throw refused("The provided URL is not allowed")
    }
    const url = new URL(current)
    let response: Awaited<ReturnType<typeof pinnedGet>>
    try {
      response = await pinnedGet(url, verdict.resolvedIps, input.signal)
    } catch {
      throw refused(
        input.signal.aborted
          ? "Downloading the file timed out"
          : "The file could not be downloaded",
      )
    }

    if (
      response.statusCode >= REDIRECT_STATUS_MIN &&
      response.statusCode <= REDIRECT_STATUS_MAX
    ) {
      discard(response.stream)
      const location = response.headers.location
      if (!location) {
        throw refused("The URL redirects without saying where")
      }
      try {
        current = new URL(location, url).toString()
      } catch {
        throw refused("The URL redirects to an invalid address")
      }
      continue
    }
    if (response.statusCode !== OK_STATUS) {
      discard(response.stream)
      throw refused(
        `Downloading the file failed with status ${response.statusCode}`,
      )
    }

    const mimeType = baseMimeType(response.headers["content-type"])
    if (!input.allowedMimeTypes.includes(mimeType)) {
      discard(response.stream)
      throw refused("The URL is not an image or video this network accepts")
    }
    const declared = Number.parseInt(
      response.headers["content-length"] ?? "0",
      10,
    )
    if (Number.isFinite(declared) && declared > input.maxBytes) {
      discard(response.stream)
      throw refused("The file is larger than the size allowed for URL imports")
    }

    const upload = createUpload(input.path, { contentType: mimeType })
    let size = 0
    const counted = limitedTo(input.maxBytes)
    counted.on("data", (chunk: Buffer) => {
      size += chunk.length
    })
    try {
      response.stream.on("error", (error) => counted.destroy(error))
      response.stream.pipe(counted).pipe(upload.stream)
      counted.on("error", (error) => upload.stream.destroy(error))
      await upload.done
    } catch (error) {
      await uploader.deleteObject(input.path).catch((cleanupError: unknown) => {
        logger.warn(
          { err: cleanupError },
          "failed to drop an aborted media import",
        )
      })
      if (error instanceof MediaImportRefusedError) {
        throw error
      }
      throw input.signal.aborted
        ? refused("Downloading the file timed out")
        : refused("The file could not be downloaded")
    }

    const imported: ImportedMediaFile = {
      height: null,
      mimeType,
      name: fileNameOf(url),
      size,
      width: null,
    }
    return imported
  }
  throw refused("The URL redirects too many times")
}
