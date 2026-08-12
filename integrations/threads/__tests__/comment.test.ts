import { type ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createReplyContainer,
  getReplyCreationStatus,
  publishReplyContainer,
  sendCommentReply,
} from "../src/apis/comment"
import {
  THREADS_GRAPH_API_URL,
  THREADS_REPLY_PUBLISH_POLL_INTERVAL_MS,
  THREADS_REPLY_PUBLISH_TIMEOUT_MS,
} from "../src/constants"
import { sendComment } from "../src/handlers/comment/outgoing-comment"
import { mapToChannelError } from "../src/lib/error-mapper"
import { logger } from "../src/lib/logger"
import type { ThreadsAuthValue } from "../src/schema"

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

const auth = {
  tokens: { accessToken: "threads-token" },
  metadata: {
    threadsUserId: "threads-user-1",
    username: "chatbotx",
    version: "v1.0",
  },
} as ThreadsAuthValue

afterEach(() => {
  vi.useRealTimers()
})

describe("threads comment api", () => {
  test("maps create/status/publish endpoints and returns the published reply id", async () => {
    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads`,
        async ({ request }) => {
          const body = await request.text()
          expect(body).toContain("media_type=TEXT")
          expect(body).toContain("text=hello+world")
          expect(body).toContain("reply_to_id=comment-123")
          expect(body).toContain("access_token=threads-token")
          return HttpResponse.json({ id: "creation-1" })
        },
      ),
      http.get(`${THREADS_GRAPH_API_URL}/v1.0/creation-1`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("fields")).toBe("status,error_message")
        expect(url.searchParams.get("access_token")).toBe("threads-token")
        return HttpResponse.json({ status: "finished" })
      }),
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads_publish`,
        async ({ request }) => {
          const body = await request.text()
          expect(body).toContain("creation_id=creation-1")
          expect(body).toContain("access_token=threads-token")
          return HttpResponse.json({ id: "reply-1" })
        },
      ),
    )

    await expect(
      sendCommentReply(auth, "comment-123", "hello world"),
    ).resolves.toEqual({ id: "reply-1" })
  })

  test("fails when reply creation status becomes ERROR", async () => {
    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads`,
        () => HttpResponse.json({ id: "creation-error" }),
      ),
      http.get(`${THREADS_GRAPH_API_URL}/v1.0/creation-error`, () =>
        HttpResponse.json({
          status: "ERROR",
          error_message: "Reply cannot be published",
        }),
      ),
    )

    await expect(
      sendCommentReply(auth, "comment-123", "hello world"),
    ).rejects.toThrow("Reply cannot be published")
  })

  test("fails when reply creation status becomes EXPIRED", async () => {
    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads`,
        () => HttpResponse.json({ id: "creation-expired" }),
      ),
      http.get(`${THREADS_GRAPH_API_URL}/v1.0/creation-expired`, () =>
        HttpResponse.json({
          status: "expired",
          error_message: "Reply creation expired",
        }),
      ),
    )

    await expect(
      sendCommentReply(auth, "comment-123", "hello world"),
    ).rejects.toThrow("Reply creation expired")
  })

  test("times out with fake timers when reply creation never becomes ready", async () => {
    vi.useFakeTimers()

    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads`,
        () => HttpResponse.json({ id: "creation-timeout" }),
      ),
      http.get(`${THREADS_GRAPH_API_URL}/v1.0/creation-timeout`, () =>
        HttpResponse.json({
          status: "IN_PROGRESS",
        }),
      ),
    )

    const promise = expect(
      sendCommentReply(auth, "comment-123", "hello world", {
        timeoutMs: THREADS_REPLY_PUBLISH_TIMEOUT_MS,
        pollIntervalMs: THREADS_REPLY_PUBLISH_POLL_INTERVAL_MS,
      }),
    ).rejects.toThrow("Retry later")

    await vi.advanceTimersByTimeAsync(THREADS_REPLY_PUBLISH_TIMEOUT_MS)

    await promise
  })

  test("createReplyContainer does not retry failed POST requests", async () => {
    let requestCount = 0

    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads`,
        () => {
          requestCount += 1
          return HttpResponse.json(
            {
              error: { message: "Service unavailable", code: 2 },
            },
            { status: 500 },
          )
        },
      ),
    )

    await expect(
      createReplyContainer(auth, "comment-123", "hello world"),
    ).rejects.toThrow()
    expect(requestCount).toBe(1)
  })

  test("publishReplyContainer does not retry failed POST requests", async () => {
    let requestCount = 0

    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads_publish`,
        () => {
          requestCount += 1
          return HttpResponse.json(
            {
              error: { message: "Service unavailable", code: 2 },
            },
            { status: 500 },
          )
        },
      ),
    )

    await expect(publishReplyContainer(auth, "creation-1")).rejects.toThrow()
    expect(requestCount).toBe(1)
  })

  test("sanitizes secrets from provider errors and derived channel errors", async () => {
    server.use(
      http.get(
        `${THREADS_GRAPH_API_URL}/v1.0/creation-secret`,
        () =>
          new HttpResponse("boom", {
            status: 500,
            headers: { "content-type": "text/plain" },
          }),
      ),
    )

    const thrown = await getReplyCreationStatus(auth, "creation-secret").catch(
      (error: unknown) => error,
    )

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).not.toContain("super-secret")

    const mapped = mapToChannelError(thrown)
    expect(mapped.message).not.toContain("super-secret")

    const synthetic = new Error(
      "request failed https://graph.threads.com/v1.0/creation-secret?access_token=super-secret&client_secret=ultra-secret",
    )
    const fallbackMapped = mapToChannelError(synthetic)
    expect(fallbackMapped.message).not.toContain("super-secret")
    expect(fallbackMapped.message).not.toContain("ultra-secret")
  })
})

describe("threads sendComment handler", () => {
  test("rejects when replyToCommentId is missing", async () => {
    await expect(
      sendComment({
        ctx: { auth },
        data: {
          contact: {} as never,
          message: {
            text: "hello",
            contentAttributes: {},
          },
        },
      } as never),
    ).rejects.toMatchObject({
      category: ChannelErrorCategory.PAYLOAD_INVALID,
    } satisfies Partial<ChannelError>)
  })

  test("rejects when text is empty", async () => {
    await expect(
      sendComment({
        ctx: { auth },
        data: {
          contact: {} as never,
          message: {
            text: "   ",
            contentAttributes: { replyToCommentId: "comment-123" },
          },
        },
      } as never),
    ).rejects.toMatchObject({
      category: ChannelErrorCategory.PAYLOAD_INVALID,
    } satisfies Partial<ChannelError>)
  })

  test("returns the published reply id from the handler", async () => {
    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads`,
        () => HttpResponse.json({ id: "creation-handler" }),
      ),
      http.get(`${THREADS_GRAPH_API_URL}/v1.0/creation-handler`, () =>
        HttpResponse.json({ status: "FINISHED" }),
      ),
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads_publish`,
        () => HttpResponse.json({ id: "reply-handler" }),
      ),
    )

    await expect(
      sendComment({
        ctx: { auth },
        data: {
          contact: {} as never,
          message: {
            text: "hello from handler",
            contentAttributes: { replyToCommentId: "comment-123" },
          },
        },
      } as never),
    ).resolves.toEqual({
      messageIds: ["reply-handler"],
    })
  })

  test("logger payload does not include provider secrets", async () => {
    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/${auth.metadata.threadsUserId}/threads`,
        () => HttpResponse.json({ id: "creation-log-secret" }),
      ),
      http.get(
        `${THREADS_GRAPH_API_URL}/v1.0/creation-log-secret`,
        () =>
          new HttpResponse("boom", {
            status: 500,
            headers: { "content-type": "text/plain" },
          }),
      ),
    )

    const error = await sendComment({
      ctx: { auth },
      data: {
        contact: {} as never,
        message: {
          text: "hello from handler",
          contentAttributes: { replyToCommentId: "comment-123" },
        },
      },
    } as never).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain("super-secret")

    const [payload] = vi.mocked(logger.error).mock.calls.at(-1) ?? []
    expect(logger.error).toHaveBeenCalledWith(
      payload,
      "Failed to send Threads comment reply",
    )
    expect(payload).toMatchObject({
      channelErrorCategory: expect.any(String),
      replyToCommentId: "comment-123",
    })
    expect(JSON.stringify(payload)).not.toContain("super-secret")
    expect(JSON.stringify(payload)).not.toContain("ultra-secret")
    expect(payload).not.toHaveProperty("errorMessage")
  })
})
