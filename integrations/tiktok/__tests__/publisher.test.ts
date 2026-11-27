import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { tiktokPublisher } from "../src/publisher"
import { quotePostIds } from "../src/publisher-api"
import { planUpload, UPLOAD_CHUNK_BYTES } from "../src/publisher-upload"

const TOKEN = "act.secret-access-token"
const MEDIA_URL = "https://files.example.com/video.mp4"
const UPLOAD_URL =
  "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=Xza"

type Call = {
  body: unknown
  headers: Record<string, string>
  method: string
  url: string
}

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data, error: { code: "ok", message: "" } }), {
    status: 200,
  })
const failed = (code: string, status = 403) =>
  new Response(JSON.stringify({ error: { code, message: code } }), { status })

const creator = {
  comment_disabled: false,
  creator_nickname: "Nick",
  duet_disabled: true,
  max_video_post_duration_sec: 300,
  privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
  stitch_disabled: false,
}

const request = (options: Record<string, boolean | number | string> = {}) => ({
  accessToken: TOKEN,
  contentType: "video" as const,
  destinationExternalId: "open-id",
  linkUrl: null,
  media: [
    {
      altText: null,
      durationMs: 30_000,
      mimeType: "video/mp4",
      url: MEDIA_URL,
    },
  ],
  options: {
    allowComment: true,
    allowDuet: true,
    allowStitch: false,
    brandContent: false,
    brandOrganic: false,
    commercialContent: false,
    coverTimestampMs: 0,
    isAigc: false,
    privacyLevel: "SELF_ONLY",
    ...options,
  },
  text: "hello #cat",
})

let calls: Call[] = []
let handler: (call: Call) => Response | Promise<Response>

beforeEach(() => {
  calls = []
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      headers: (init.headers ?? {}) as Record<string, string>,
      method: init.method ?? "GET",
      url,
    }
    calls.push(call)
    return await handler(call)
  })
})
afterEach(() => vi.unstubAllGlobals())

const head = (size: number) =>
  new Response(null, {
    headers: { "content-length": String(size) },
    status: 200,
  })

describe("tiktok publisher: publish", () => {
  test("inits a FILE_UPLOAD post and returns the publish id before any byte is sent", async () => {
    handler = (call) => {
      if (call.url.endsWith("creator_info/query/")) {
        return ok(creator)
      }
      if (call.method === "HEAD") {
        return head(50_000_123)
      }
      return ok({ publish_id: "v_pub_file~v2-1.1", upload_url: UPLOAD_URL })
    }
    const result = await tiktokPublisher.publish(request())
    expect(result).toMatchObject({
      continuation: {
        phase: "upload",
        publishId: "v_pub_file~v2-1.1",
        offset: "0",
        videoSize: "50000123",
      },
      status: "pending",
    })
    const init = calls.find((call) => call.url.endsWith("video/init/"))
    expect(init?.body).toMatchObject({
      post_info: {
        disable_comment: false,
        // the creator disabled duets: forced off even though the user asked for it
        disable_duet: true,
        disable_stitch: true,
        privacy_level: "SELF_ONLY",
        title: "hello #cat",
      },
      source_info: {
        chunk_size: UPLOAD_CHUNK_BYTES,
        source: "FILE_UPLOAD",
        total_chunk_count: 2,
        video_size: 50_000_123,
      },
    })
    expect(calls.some((call) => call.method === "PUT")).toBe(false)
    // the token is only ever in the Authorization header, never stored or returned
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test("refuses a privacy level the creator does not offer without calling init", async () => {
    handler = (call) =>
      call.url.endsWith("creator_info/query/") ? ok(creator) : head(10)
    const result = await tiktokPublisher.publish(
      request({ privacyLevel: "FOLLOWER_OF_CREATOR" }),
    )
    expect(result).toMatchObject({
      category: "payloadInvalid",
      code: "privacy_level_option_mismatch",
      provablyNotCreated: true,
      status: "failed",
    })
    expect(calls.some((call) => call.url.endsWith("video/init/"))).toBe(false)
  })

  test("stops when the creator cannot post now", async () => {
    handler = () => failed("spam_risk_too_many_posts")
    expect(await tiktokPublisher.publish(request())).toMatchObject({
      category: "rateLimited",
      provablyNotCreated: true,
      scope: "account",
      status: "failed",
    })
  })

  test.each([
    ["spam_risk_too_many_pending_share", "rateLimited", "account"],
    ["spam_risk_too_many_posts", "rateLimited", "account"],
  ])("%s is a limit answer of the account (%s)", async (code, category, scope) => {
    handler = () => failed(code)
    expect(await tiktokPublisher.publish(request())).toMatchObject({
      category,
      scope,
      status: "failed",
    })
  })

  test("rate_limit_exceeded is a per-token throttle, not an account limit", async () => {
    handler = () => failed("rate_limit_exceeded")
    expect(await tiktokPublisher.publish(request())).toMatchObject({
      category: "rateLimited",
      provablyNotCreated: true,
      scope: "token",
      status: "failed",
    })
  })

  test("a user banned from posting fails for good: no retry, no auth failure", async () => {
    handler = () => failed("spam_risk_user_banned_from_posting")
    expect(await tiktokPublisher.publish(request())).toMatchObject({
      category: "payloadInvalid",
      code: "spam_risk_user_banned_from_posting",
      provablyNotCreated: true,
      status: "failed",
    })
  })

  test("rejects a video longer than the creator's limit", async () => {
    handler = () => ok({ ...creator, max_video_post_duration_sec: 10 })
    expect(await tiktokPublisher.publish(request())).toMatchObject({
      code: "duration_check_failed",
      status: "failed",
    })
  })

  test.each([
    ["access_token_invalid", "authFailed"],
    ["scope_not_authorized", "permissionDenied"],
    ["rate_limit_exceeded", "rateLimited"],
    ["url_ownership_unverified", "payloadInvalid"],
    ["unaudited_client_can_only_post_to_private_accounts", "permissionDenied"],
    ["reached_active_user_cap", "quotaExceeded"],
  ])("maps the init error %s to %s", async (code, category) => {
    handler = (call) => {
      if (call.url.endsWith("creator_info/query/")) {
        return ok(creator)
      }
      if (call.method === "HEAD") {
        return head(1000)
      }
      return failed(code)
    }
    expect(await tiktokPublisher.publish(request())).toMatchObject({
      category,
      code,
      provablyNotCreated: true,
    })
  })

  test("an init that dies on the network is not provably 'nothing created'", async () => {
    handler = (call) => {
      if (call.url.endsWith("creator_info/query/")) {
        return ok(creator)
      }
      if (call.method === "HEAD") {
        return head(1000)
      }
      throw new Error("socket hang up")
    }
    expect(await tiktokPublisher.publish(request())).toMatchObject({
      category: "networkError",
      provablyNotCreated: false,
    })
  })
})

describe("tiktok publisher: upload and status", () => {
  const size = 50_000_123
  const continuation = {
    mediaUrl: MEDIA_URL,
    mimeType: "video/mp4",
    offset: "0",
    phase: "upload",
    publishId: "v_pub_file~v2-1.1",
    uploadUrl: UPLOAD_URL,
    videoSize: String(size),
  }
  const statusRequest = (cont: Record<string, string>) => ({
    accessToken: TOKEN,
    continuation: cont,
    contentType: "video" as const,
    destinationExternalId: "open-id",
    options: {},
    text: null,
  })

  test("streams ranged chunks, one in memory, with TikTok's Content-Range rules", async () => {
    const sent: { length: number; range: string }[] = []
    handler = (call) => {
      if (call.method === "PUT") {
        const bytes = call.body as Uint8Array
        const range = call.headers["Content-Range"] ?? ""
        sent.push({ length: bytes.byteLength, range })
        return new Response(null, {
          status: range.startsWith("bytes 20971520") ? 201 : 206,
        })
      }
      const [start, end] = (call.headers.Range ?? "")
        .replace("bytes=", "")
        .split("-")
        .map(Number)
      return new Response(new Uint8Array((end ?? 0) - (start ?? 0) + 1), {
        status: 206,
      })
    }
    const result = await tiktokPublisher.checkStatus(
      statusRequest(continuation),
    )
    expect(sent).toEqual([
      {
        length: UPLOAD_CHUNK_BYTES,
        range: `bytes 0-${UPLOAD_CHUNK_BYTES - 1}/${size}`,
      },
      {
        length: size - UPLOAD_CHUNK_BYTES,
        range: `bytes ${UPLOAD_CHUNK_BYTES}-${size - 1}/${size}`,
      },
    ])
    // each chunk is at least 5 MB and at most 64 MB (the last may absorb the remainder)
    expect(Math.max(...sent.map((chunk) => chunk.length))).toBeLessThanOrEqual(
      64 * 1024 * 1024,
    )
    expect(result).toMatchObject({
      continuation: { phase: "processing" },
      status: "pending",
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  const resumeHandler =
    (uploadedBytes: number | undefined, sent: string[]) =>
    (call: Call): Response => {
      if (call.url.includes("/status/fetch/")) {
        return ok({
          status: "PROCESSING_UPLOAD",
          uploaded_bytes: uploadedBytes,
        })
      }
      if (call.method === "PUT") {
        sent.push(call.headers["Content-Range"] ?? "")
        return new Response(null, { status: 201 })
      }
      const [start, end] = (call.headers.Range ?? "")
        .replace("bytes=", "")
        .split("-")
        .map(Number)
      return new Response(new Uint8Array((end ?? 0) - (start ?? 0) + 1), {
        status: 206,
      })
    }

  test("a chunk the server already reports as uploaded is not sent again", async () => {
    const sent: string[] = []
    handler = resumeHandler(UPLOAD_CHUNK_BYTES, sent)
    const result = await tiktokPublisher.checkStatus(
      statusRequest(continuation),
    )
    expect(sent).toEqual([`bytes ${UPLOAD_CHUNK_BYTES}-${size - 1}/${size}`])
    expect(result).toMatchObject({ continuation: { phase: "processing" } })
  })

  test("a fully uploaded file moves to processing without any PUT", async () => {
    const sent: string[] = []
    handler = resumeHandler(size, sent)
    const result = await tiktokPublisher.checkStatus(
      statusRequest(continuation),
    )
    expect(sent).toEqual([])
    expect(result).toMatchObject({
      continuation: { phase: "processing" },
      status: "pending",
    })
  })

  test("a reported offset that is not a chunk boundary keeps the stored offset", async () => {
    const sent: string[] = []
    handler = resumeHandler(12_345, sent)
    await tiktokPublisher.checkStatus(statusRequest(continuation))
    expect(sent[0]).toBe(`bytes 0-${UPLOAD_CHUNK_BYTES - 1}/${size}`)
  })

  test("a lagging reported offset never moves the upload backwards", async () => {
    const sent: string[] = []
    handler = resumeHandler(0, sent)
    await tiktokPublisher.checkStatus(
      statusRequest({ ...continuation, offset: String(UPLOAD_CHUNK_BYTES) }),
    )
    expect(sent[0]).toBe(`bytes ${UPLOAD_CHUNK_BYTES}-${size - 1}/${size}`)
  })

  test("a storage that ignores Range ends the upload without sending garbage", async () => {
    handler = () => new Response(new Uint8Array(10), { status: 200 })
    expect(
      await tiktokPublisher.checkStatus(statusRequest(continuation)),
    ).toMatchObject({
      code: "source_range_unsupported",
      provablyNotCreated: false,
      status: "failed",
    })
    expect(calls.some((call) => call.method === "PUT")).toBe(false)
  })

  test("a final chunk answered 206 is not a finished upload", async () => {
    handler = (call) => {
      if (call.method === "PUT") {
        return new Response(null, { status: 206 })
      }
      const [start, end] = (call.headers.Range ?? "")
        .replace("bytes=", "")
        .split("-")
        .map(Number)
      return new Response(new Uint8Array((end ?? 0) - (start ?? 0) + 1), {
        status: 206,
      })
    }
    expect(
      await tiktokPublisher.checkStatus(statusRequest(continuation)),
    ).toMatchObject({
      code: "upload_not_confirmed",
      provablyNotCreated: false,
      status: "failed",
    })
  })

  test("an expired upload link is reported, not retried blindly", async () => {
    handler = (call) =>
      call.method === "PUT"
        ? new Response(null, { status: 403 })
        : new Response(new Uint8Array(UPLOAD_CHUNK_BYTES), { status: 206 })
    expect(
      await tiktokPublisher.checkStatus(statusRequest(continuation)),
    ).toMatchObject({
      code: "upload_url_expired",
      provablyNotCreated: false,
    })
  })

  test("planUpload cuts a file like the transfer guide", () => {
    expect(planUpload(4_194_304)).toEqual({
      chunkSize: 4_194_304,
      chunks: [{ end: 4_194_303, start: 0 }],
    })
    const plan = planUpload(50_000_123)
    expect(plan.chunks).toHaveLength(2)
    expect(plan.chunks.at(-1)?.end).toBe(50_000_122)
  })

  const processing = { ...continuation, phase: "processing" }
  const statusOf = (data: unknown) => {
    handler = () => ok(data)
  }

  test("a throttled status read keeps the publish id and never starts a second upload", async () => {
    handler = () => failed("rate_limit_exceeded", 429)
    const result = await tiktokPublisher.checkStatus(statusRequest(processing))
    expect(result).toMatchObject({
      continuation: { publishId: "v_pub_file~v2-1.1" },
      retryAfterMs: 60_000,
      status: "pending",
    })
    expect(calls.some((call) => call.url.endsWith("video/init/"))).toBe(false)
  })

  test("repeated throttles end in a failure that is not provably uncreated", async () => {
    handler = () => failed("rate_limit_exceeded", 429)
    let current: Record<string, string> = processing
    let result = await tiktokPublisher.checkStatus(statusRequest(current))
    for (let i = 0; i < 20 && result.status === "pending"; i += 1) {
      current = result.continuation
      result = await tiktokPublisher.checkStatus(statusRequest(current))
    }
    expect(result).toMatchObject({
      code: "status_throttle_exhausted",
      provablyNotCreated: false,
      status: "failed",
    })
  })

  test("any other status failure never claims nothing was created", async () => {
    handler = () => failed("access_token_invalid", 401)
    expect(
      await tiktokPublisher.checkStatus(statusRequest(processing)),
    ).toMatchObject({ provablyNotCreated: false, status: "failed" })
  })

  test("PUBLISH_COMPLETE with a public post id publishes it as a string", async () => {
    handler = () =>
      new Response(
        '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7234567890123456789]},"error":{"code":"ok"}}',
        { status: 200 },
      )
    expect(
      await tiktokPublisher.checkStatus(statusRequest(processing)),
    ).toEqual({
      externalPostId: "7234567890123456789",
      permalink: null,
      status: "published",
    })
  })

  test("a private post without an id stands in with its publish id", async () => {
    statusOf({ publicaly_available_post_id: [], status: "PUBLISH_COMPLETE" })
    expect(
      await tiktokPublisher.checkStatus(statusRequest(processing)),
    ).toMatchObject({
      externalPostId: "v_pub_file~v2-1.1",
      status: "published",
    })
  })

  test.each([
    "PROCESSING_UPLOAD",
    "PROCESSING_DOWNLOAD",
    "SEND_TO_USER_INBOX",
  ])("%s keeps polling", async (status) => {
    statusOf({ status })
    expect(
      await tiktokPublisher.checkStatus(statusRequest(processing)),
    ).toMatchObject({ status: "pending" })
  })

  test.each([
    ["file_format_check_failed", "mediaInvalid", true],
    ["duration_check_failed", "mediaInvalid", true],
    ["frame_rate_check_failed", "mediaInvalid", true],
    ["picture_size_check_failed", "mediaInvalid", true],
    ["internal", "networkError", true],
    ["spam_risk", "payloadInvalid", true],
    ["auth_removed", "authFailed", true],
  ])("FAILED %s is classified as %s", async (reason, category, provable) => {
    statusOf({ fail_reason: reason, status: "FAILED" })
    expect(
      await tiktokPublisher.checkStatus(statusRequest(processing)),
    ).toMatchObject({
      category,
      code: reason,
      provablyNotCreated: provable,
      status: "failed",
    })
  })

  test("delete is refused: the API has no delete", async () => {
    expect(
      await tiktokPublisher.delete({ accessToken: TOKEN, externalPostId: "1" }),
    ).toMatchObject({
      code: "delete_not_supported",
      status: "failed",
    })
  })

  test("post ids above 2^53 are kept exact", () => {
    expect(
      quotePostIds('{"publicaly_available_post_id":[9007199254740993,1]}'),
    ).toBe('{"publicaly_available_post_id":["9007199254740993","1"]}')
  })

  test("post ids that are already strings are left untouched", () => {
    const body = '{"publicaly_available_post_id":["123","a1b2",7]}'
    expect(quotePostIds(body)).toBe(
      '{"publicaly_available_post_id":["123","a1b2","7"]}',
    )
    expect(() => JSON.parse(quotePostIds(body))).not.toThrow()
  })
})
