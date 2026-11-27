import { readFileSync } from "node:fs"
import { describe, expect, test, vi } from "vitest"
import { MUSE_BASE_URL } from "../src/core/muse"
import {
  SAM_MAX_OUTPUT_TEXT_CHARS,
  SAM_MAX_SSE_BUFFER_CHARS,
  SAM_MODEL,
  SamSegmentationError,
  segmentImage,
} from "../src/server/sam"

// Streams are written by hand from the grammar Meta publishes at
// https://dev.meta.ai/docs/sam/reading-segmentation, except the `live-*`
// captures (see fixtures/sam/live/README.md). Hand-written mask payloads are
// placeholders: the client skips mask tokens and never decodes them.

const liveFixture = (name: string) =>
  readFileSync(new URL(`./fixtures/sam/live/${name}`, import.meta.url), "utf8")

const encoder = new TextEncoder()

/** Splits the body into byte chunks of `size`, so any boundary is exercised. */
function chunkedBody(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(text)
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + size))
      offset += size
    },
  })
}

function sseResponse(text: string, chunkSize = 4096): Response {
  return new Response(chunkedBody(text, chunkSize), {
    headers: { "content-type": "text/event-stream; charset=utf-8" },
    status: 200,
  })
}

function sseEvents(events: Record<string, unknown>[]): string {
  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("")
}

const lane = { item_id: "msg-1", output_index: 0, content_index: 0 }
const RATE_LIMITED_FAILURE = /^SAM request failed with status 429: rate limited/
const SOURCE = { width: 20, height: 10 }

/** One object: a box in a 20×10 frame plus a mask token that is skipped. */
const object = (id: number, box = "x1=0;y1=0;x2=4;y2=4", extra = ""): string =>
  `${id}<|box;${box};w=20;h=10${extra}|><|mask;x=0;y=0;data=5,5,!pl;ace=hold<er|>`

/** One output-text lane finalized like the live API, then completed. */
function liveStream(text: string, extra: Record<string, unknown>[] = []) {
  return sseEvents([
    { type: "response.created" },
    { type: "response.in_progress" },
    { type: "response.output_item.added", output_index: 0, item: {} },
    { type: "response.content_part.added", ...lane, part: {} },
    { type: "response.output_text.delta", ...lane, delta: text },
    {
      type: "response.content_part.done",
      ...lane,
      part: { type: "output_text", text },
    },
    { type: "response.output_item.done", output_index: 0, item: {} },
    ...extra,
    { type: "response.completed" },
  ])
}

const TWO_OBJECTS = `<0f>${object(0, "x1=2;y1=1;x2=6;y2=4", ";c=0.75")},${object(1, "x1=10;y1=3;x2=19;y2=9", ";c=1")}\n`

function run(
  response: Response | ((request: Request) => Promise<Response>),
  signal = new AbortController().signal,
  sourceSize = SOURCE,
) {
  const fetchMock = vi.fn(
    typeof response === "function"
      ? response
      : async (_request: Request) => response,
  )
  return {
    fetchMock,
    result: segmentImage({
      apiKey: "muse-key",
      fetch: fetchMock,
      image: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      signal,
      sourceSize,
      target: "wheel",
    }),
  }
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected a rejection")
}

function invalidOutputFor(text: string, sourceSize = SOURCE) {
  return rejection(
    run(sseResponse(liveStream(text)), undefined, sourceSize).result,
  )
}

describe("segmentImage", () => {
  test("sends a streaming sam-3.1 request with the image as a data URL", async () => {
    let request: Request | undefined
    let body: unknown
    const { result } = run(async (input) => {
      request = input
      body = await input.clone().json()
      return sseResponse(liveStream(TWO_OBJECTS))
    })
    await result

    expect(request?.url).toBe(`${MUSE_BASE_URL}/responses`)
    expect(request?.method).toBe("POST")
    expect(request?.headers.get("authorization")).toBe("Bearer muse-key")
    expect(request?.headers.get("accept")).toBe("text/event-stream")
    expect(body).toEqual({
      model: SAM_MODEL,
      stream: true,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "wheel" },
            { type: "input_image", image_url: "data:image/png;base64,AQID" },
          ],
        },
      ],
      metadata: { include_confidence: "true", mask_encoding: "one_bit" },
    })
  })

  test("returns every box as half-open source pixels with its confidence", async () => {
    const { result } = run(sseResponse(liveStream(TWO_OBJECTS)))

    expect(await result).toEqual({
      kind: "matched",
      boxes: [
        { objectId: 0, left: 2, top: 1, right: 7, bottom: 5, confidence: 0.75 },
        {
          objectId: 1,
          left: 10,
          top: 3,
          right: 20,
          bottom: 10,
          confidence: 1,
        },
      ],
    })
  })

  test.each([
    1, 3, 7, 64,
  ])("parses the same result when the body is split every %i bytes", async (chunkSize) => {
    const { result } = run(sseResponse(liveStream(TWO_OBJECTS), chunkSize))
    const output = await result

    expect(output.kind === "matched" && output.boxes).toHaveLength(2)
  })

  test("splits inside a multi-byte character without corrupting JSON", async () => {
    const body = sseEvents([
      { type: "response.created", note: "xe đạp" },
      { type: "response.output_text.delta", ...lane, delta: TWO_OBJECTS },
      {
        type: "response.content_part.done",
        ...lane,
        part: { type: "output_text", text: TWO_OBJECTS },
      },
      { type: "response.completed" },
    ])
    const { result } = run(sseResponse(body, 1))

    expect((await result).kind).toBe("matched")
  })

  test("maps an empty finalized lane to no_match", async () => {
    const { result } = run(sseResponse(liveStream("")))

    expect(await result).toEqual({ kind: "no_match" })
  })

  test("reads the output text from response.completed when no lane streamed", async () => {
    const { result } = run(
      sseResponse(
        sseEvents([
          {
            type: "response.completed",
            response: {
              output: [
                { content: [{ type: "output_text", text: TWO_OBJECTS }] },
              ],
            },
          },
        ]),
      ),
    )

    expect(await result).toMatchObject({
      kind: "matched",
      boxes: [{ objectId: 0 }, { objectId: 1 }],
    })
  })

  test("maps an empty output text in response.completed to no_match", async () => {
    const { result } = run(
      sseResponse(
        sseEvents([
          {
            type: "response.completed",
            response: { output: [{ content: [{ type: "output_text" }] }] },
          },
        ]),
      ),
    )

    expect(await result).toEqual({ kind: "no_match" })
  })

  test.each([
    ["no response", {}],
    ["no output", { response: { output: [] } }],
    [
      "two output texts",
      {
        response: {
          output: [
            {
              content: [
                { type: "output_text", text: "" },
                { type: "output_text", text: "" },
              ],
            },
          ],
        },
      },
    ],
    [
      "a refusal",
      { response: { output: [{ content: [{ type: "refusal" }] }] } },
    ],
  ])("rejects a lane-less response.completed with %s instead of reporting no match", async (_name, payload) => {
    const { result } = run(
      sseResponse(sseEvents([{ type: "response.completed", ...payload }])),
    )

    expect(await rejection(result)).toMatchObject({
      code: "stream_error",
      retryable: false,
    })
  })

  test.each([
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [401, false],
  ])("maps HTTP %i to a typed error (retryable=%s)", async (status, retryable) => {
    const { result } = run(new Response("nope", { status }))
    const error = await rejection(result)

    expect(error).toBeInstanceOf(SamSegmentationError)
    expect(error).toMatchObject({ code: "http_error", retryable, status })
  })

  test("rejects a non-SSE success response", async () => {
    const { result } = run(
      new Response("{}", {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    )

    expect(await rejection(result)).toMatchObject({
      code: "invalid_response",
      retryable: false,
    })
  })

  test("rejects malformed event JSON", async () => {
    const { result } = run(
      sseResponse("event: response.created\ndata: {not json\n\n"),
    )

    expect(await rejection(result)).toMatchObject({
      code: "malformed_event",
      retryable: false,
    })
  })

  test("rejects an event without a type", async () => {
    const { result } = run(sseResponse('data: {"delta":"x"}\n\n'))

    expect(await rejection(result)).toMatchObject({
      code: "malformed_event",
      retryable: false,
    })
  })

  test("rejects a text delta without its lane fields", async () => {
    const { result } = run(
      sseResponse(
        sseEvents([{ type: "response.output_text.delta", delta: "<0f>" }]),
      ),
    )

    expect(await rejection(result)).toMatchObject({
      code: "malformed_event",
      retryable: false,
    })
  })

  test.each([
    ["server_error", true],
    ["rate_limit_exceeded", true],
    ["invalid_request_error", false],
    [undefined, false],
  ])("maps response.failed with code %s to a stream error (retryable=%s)", async (code, retryable) => {
    const { result } = run(
      sseResponse(
        sseEvents([
          { type: "response.created" },
          {
            type: "response.failed",
            response: { error: { code, message: "Meta said no" } },
          },
        ]),
      ),
    )
    const error = await rejection(result)

    expect(error).toMatchObject({ code: "stream_error", retryable })
    expect((error as Error).message).toContain("Meta said no")
  })

  test.each([
    ["server_error", true],
    ["rate_limit_exceeded", true],
    ["invalid_prompt", false],
    [undefined, false],
  ])("maps an SSE error event with code %s to a stream error (retryable=%s)", async (code, retryable) => {
    const { result } = run(
      sseResponse(sseEvents([{ type: "error", code, message: "overloaded" }])),
    )
    const error = await rejection(result)

    expect(error).toMatchObject({ code: "stream_error", retryable })
    expect((error as Error).message).toContain("overloaded")
    expect((error as Error).message).not.toContain("type=error")
  })

  test("rejects a stream that ends before a terminal event", async () => {
    const { result } = run(
      sseResponse(
        sseEvents([
          { type: "response.created" },
          { type: "response.output_text.delta", ...lane, delta: TWO_OBJECTS },
        ]),
      ),
    )

    expect(await rejection(result)).toMatchObject({
      code: "incomplete",
      retryable: false,
    })
  })

  test("propagates an abort before the response arrives", async () => {
    const controller = new AbortController()
    const { result } = run(
      (request) =>
        new Promise<Response>((_resolve, reject) => {
          if (request.signal.aborted) {
            reject(request.signal.reason)
            return
          }
          request.signal.addEventListener("abort", () =>
            reject(request.signal.reason),
          )
        }),
      controller.signal,
    )
    controller.abort(new DOMException("deadline", "AbortError"))

    expect(await rejection(result)).toMatchObject({ name: "AbortError" })
  })

  test("treats a body read failure mid-stream as retryable", async () => {
    const bytes = encoder.encode(
      sseEvents([
        { type: "response.output_text.delta", ...lane, delta: "<0f>" },
      ]),
    )
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.error(new TypeError("socket hang up"))
      },
    })
    const { result } = run(
      new Response(body, {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      }),
    )

    expect(await rejection(result)).toMatchObject({
      code: "stream_error",
      retryable: true,
    })
  })
})

describe("segmentImage on captured live responses", () => {
  const LIVE_SOURCE = { width: 1920, height: 1280 }

  test("reads every box of a live match, finalized by both done events", async () => {
    const { result } = run(
      sseResponse(liveFixture("live-success.sse"), 7),
      undefined,
      LIVE_SOURCE,
    )

    expect(await result).toEqual({
      kind: "matched",
      boxes: [
        {
          objectId: 0,
          left: 870,
          top: 555,
          right: 1399,
          bottom: 1123,
          confidence: 0.964_912_295_341_491_7,
        },
        {
          objectId: 1,
          left: 96,
          top: 422,
          right: 630,
          bottom: 932,
          confidence: 0.964_912_295_341_491_7,
        },
        {
          objectId: 2,
          left: 526,
          top: 266,
          right: 1021,
          bottom: 804,
          confidence: 0.964_912_295_341_491_7,
        },
      ],
    })
  })

  test("maps a live empty lane to no_match", async () => {
    const { result } = run(
      sseResponse(liveFixture("live-no-match.sse")),
      undefined,
      LIVE_SOURCE,
    )

    expect(await result).toEqual({ kind: "no_match" })
  })

  test("rejects the live capture when the image size differs", async () => {
    const { result } = run(
      sseResponse(liveFixture("live-success.sse")),
      undefined,
      { width: 1280, height: 1920 },
    )

    expect(await rejection(result)).toMatchObject({ code: "invalid_output" })
  })

  test("maps the live invalid-key body to a non-retryable 401", async () => {
    const { result } = run(
      new Response(liveFixture("live-invalid-key.sse"), {
        headers: { "content-type": "application/json" },
        status: 401,
      }),
    )

    const error = await rejection(result)

    expect(error).toMatchObject({
      code: "http_error",
      retryable: false,
      status: 401,
    })
    expect((error as Error).message).toBe(
      "SAM request failed with status 401: Unauthorized, type=authentication_error, code=invalid_api_key",
    )
  })
})

describe("segmentImage output grammar", () => {
  test("skips mask tokens and unknown token kinds without reading them", async () => {
    const text =
      "<0f>4<|box;x1=1;y1=1;x2=2;y2=2;w=20;h=10|><|mask;data=1,1,~<,;=|><|future;k=v|>\n"
    const { result } = run(sseResponse(liveStream(text)))

    expect(await result).toEqual({
      kind: "matched",
      boxes: [{ objectId: 4, left: 1, top: 1, right: 3, bottom: 3 }],
    })
  })

  test("reads box fields by key, in any order, ignoring unknown keys", async () => {
    const text = "<0f>0<|box;h=10;w=20;y2=4;x2=4;future=1;y1=0;x1=0|>\n"
    const { result } = run(sseResponse(liveStream(text)))

    expect(await result).toEqual({
      kind: "matched",
      boxes: [{ objectId: 0, left: 0, top: 0, right: 5, bottom: 5 }],
    })
  })

  test("accepts a box touching the right and bottom edges", async () => {
    const { result } = run(
      sseResponse(liveStream(`<0f>${object(0, "x1=0;y1=0;x2=19;y2=9")}\n`)),
    )
    const output = await result

    expect(output.kind === "matched" && output.boxes[0]).toMatchObject({
      right: SOURCE.width,
      bottom: SOURCE.height,
    })
  })

  test.each([
    ["5e-05", 0.000_05],
    ["1e-4", 0.0001],
    [".5", 0.5],
    ["0.5e0", 0.5],
    ["1", 1],
    ["0", 0],
  ])("reads confidence %s as a float", async (raw, confidence) => {
    const { result } = run(
      sseResponse(liveStream(`<0f>${object(0, undefined, `;c=${raw}`)}\n`)),
    )

    expect(await result).toMatchObject({ boxes: [{ confidence }] })
  })

  test.each([
    ["above 1", "1.5"],
    ["negative", "-0.1"],
    ["not a number", "high"],
    ["empty", ""],
  ])("drops a confidence that is %s but keeps the box", async (_name, raw) => {
    const { result } = run(
      sseResponse(liveStream(`<0f>${object(0, undefined, `;c=${raw}`)}\n`)),
    )

    expect(await result).toEqual({
      kind: "matched",
      boxes: [{ objectId: 0, left: 0, top: 0, right: 5, bottom: 5 }],
    })
  })

  test("a later line for the same object replaces the earlier one", async () => {
    const text = `<0f>${object(0)}\n<0f>${object(0, "x1=1;y1=1;x2=5;y2=5")}\n`
    const { result } = run(sseResponse(liveStream(text)))
    const output = await result

    expect(output.kind === "matched" && output.boxes).toEqual([
      { objectId: 0, left: 1, top: 1, right: 6, bottom: 6 },
    ])
  })

  test("treats a completed prose-only answer as no match", async () => {
    const { result } = run(sseResponse(liveStream("No wheel here.\n")))

    expect(await result).toEqual({ kind: "no_match" })
  })

  test.each([
    ["a box missing a corner", "<0f>0<|box;x1=0;y1=0;w=20;h=10|>\n"],
    ["a negative coordinate", `<0f>${object(0, "x1=-1;y1=0;x2=4;y2=4")}\n`],
    ["a fractional coordinate", `<0f>${object(0, "x1=0.5;y1=0;x2=4;y2=4")}\n`],
    [
      "an unsafe integer",
      `<0f>${object(0, "x1=9007199254740993;y1=0;x2=4;y2=4")}\n`,
    ],
    ["x1 past x2", `<0f>${object(0, "x1=5;y1=0;x2=4;y2=4")}\n`],
    ["y1 past y2", `<0f>${object(0, "x1=0;y1=5;x2=4;y2=4")}\n`],
    ["x2 outside the frame", `<0f>${object(0, "x1=0;y1=0;x2=20;y2=4")}\n`],
    ["y2 outside the frame", `<0f>${object(0, "x1=0;y1=0;x2=4;y2=10")}\n`],
    [
      "a repeated box field",
      "<0f>0<|box;x1=0;x1=1;y1=0;x2=4;y2=4;w=20;h=10|>\n",
    ],
    [
      "a field without a key",
      "<0f>0<|box;x1=0;y1=0;x2=4;y2=4;w=20;h=10;=1|>\n",
    ],
    ["an object without a box", "<0f>0<|mask;data=1,1,!x|>\n"],
    [
      "an object with two boxes",
      "<0f>0<|box;x1=0;y1=0;x2=1;y2=1;w=20;h=10|><|box;x1=0;y1=0;x2=1;y2=1;w=20;h=10|>\n",
    ],
    ["the same object twice in a frame", `<0f>${object(0)},${object(0)}\n`],
    ["a missing object id", "<0f><|box;x1=0;y1=0;x2=4;y2=4;w=20;h=10|>\n"],
    ["a trailing separator", `<0f>${object(0)},\n`],
    ["text after an object", `<0f>${object(0)} trailing\n`],
    ["an unterminated token", "<0f>0<|box;x1=0;y1=0;x2=4\n"],
    ["a video frame in image output", `<1f>${object(0)}\n`],
    ["tokens without a frame marker", `${object(0)}\n`],
  ])("rejects %s as invalid output", async (_name, text) => {
    expect(await invalidOutputFor(text)).toMatchObject({
      code: "invalid_output",
      retryable: false,
    })
  })

  test("rejects a frame size that differs from the source image", async () => {
    const error = await invalidOutputFor(`<0f>${object(0)}\n`, {
      width: 40,
      height: 20,
    })

    expect(error).toMatchObject({ code: "invalid_output", retryable: false })
    expect(String((error as Error).message)).toContain("20x10")
  })
})

describe("segmentImage stream edge cases", () => {
  test("ignores a [DONE] sentinel, comments, unknown SSE fields and events without a name", async () => {
    const text = `<0f>${object(0)}\n`
    const body = [
      ": keep-alive\n\n",
      "retry: soon\n\n",
      "x-meta-trace: abc\n\n",
      `data: ${JSON.stringify({ type: "response.output_text.delta", ...lane, delta: text })}\n\n`,
      `data: ${JSON.stringify({ type: "response.content_part.done", ...lane, part: { type: "output_text", text } })}\n\n`,
      `data: ${JSON.stringify({ type: "response.completed" })}\n\n`,
      "data: [DONE]\n\n",
    ].join("")
    const { result } = run(sseResponse(body, 2))

    expect((await result).kind).toBe("matched")
  })

  test("skips a [DONE] sentinel that arrives before the terminal event", async () => {
    const text = `<0f>${object(0)}\n`
    const body = [
      `data: ${JSON.stringify({ type: "response.output_text.delta", ...lane, delta: text })}\n\n`,
      `data: ${JSON.stringify({ type: "response.content_part.done", ...lane, part: { type: "output_text", text } })}\n\n`,
      "data: [DONE]\n\n",
      `data: ${JSON.stringify({ type: "response.completed" })}\n\n`,
    ].join("")
    const { result } = run(sseResponse(body))

    expect((await result).kind).toBe("matched")
  })

  test("survives a body that ends inside a multi-byte character", async () => {
    const bytes = new Uint8Array([
      ...encoder.encode(liveStream(`<0f>${object(0)}\n`)),
      // First byte of "é" with no continuation byte.
      0xc3,
    ])
    const { result } = run(
      new Response(new Blob([bytes]).stream(), {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      }),
    )

    expect((await result).kind).toBe("matched")
  })

  test("flushes a dangling byte at EOF and still reports the early end", async () => {
    const bytes = new Uint8Array([
      ...encoder.encode(
        sseEvents([
          { type: "response.output_text.delta", ...lane, delta: "<0f>" },
        ]),
      ),
      0xc3,
    ])
    const { result } = run(
      new Response(new Blob([bytes]).stream(), {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      }),
    )

    expect(await rejection(result)).toMatchObject({ code: "incomplete" })
  })

  test("joins text split across many deltas", async () => {
    const text = `<0f>${object(0)},${object(1)}\n`
    const deltas = [...text].map((char) => ({
      type: "response.output_text.delta",
      ...lane,
      delta: char,
    }))
    const { result } = run(
      sseResponse(
        sseEvents([
          ...deltas,
          {
            type: "response.content_part.done",
            ...lane,
            part: { type: "output_text", text },
          },
          { type: "response.completed" },
        ]),
      ),
    )
    const output = await result

    expect(output.kind === "matched" && output.boxes).toHaveLength(2)
  })

  test("accepts output_text.done and content_part.done that agree", async () => {
    const text = `<0f>${object(0)}\n`
    const { result } = run(
      sseResponse(
        liveStream(text, [
          { type: "response.output_text.done", ...lane, text },
        ]),
      ),
    )

    expect((await result).kind).toBe("matched")
  })

  test("accepts a lane finalized without deltas", async () => {
    const text = `<0f>${object(0)}\n`
    const { result } = run(
      sseResponse(
        sseEvents([
          { type: "response.output_text.done", ...lane, text },
          { type: "response.completed" },
        ]),
      ),
    )

    expect((await result).kind).toBe("matched")
  })

  test("rejects an SSE frame over the buffer bound without retrying", async () => {
    const huge = `data: ${"a".repeat(SAM_MAX_SSE_BUFFER_CHARS + 10)}`
    const { result } = run(sseResponse(huge, 1_000_000))

    expect(await rejection(result)).toMatchObject({
      code: "malformed_event",
      retryable: false,
    })
  })

  test("rejects a text lane over the total bound even when each delta is small", async () => {
    const chunk = "a".repeat(1_000_000)
    const deltas = Array.from(
      { length: Math.ceil(SAM_MAX_OUTPUT_TEXT_CHARS / chunk.length) + 1 },
      () => ({ type: "response.output_text.delta", ...lane, delta: chunk }),
    )
    const { result } = run(sseResponse(sseEvents(deltas), 1_000_000))

    expect(await rejection(result)).toMatchObject({
      code: "invalid_output",
      retryable: false,
    })
  })

  test.each([
    [
      "a refusal content part",
      {
        type: "response.content_part.done",
        ...lane,
        part: { type: "refusal", refusal: "Not allowed" },
      },
    ],
    [
      "a refusal delta",
      { type: "response.refusal.delta", ...lane, delta: "Not allowed" },
    ],
  ])("maps %s to a non-retryable stream error", async (_name, event) => {
    const { result } = run(
      sseResponse(sseEvents([event, { type: "response.completed" }])),
    )

    expect(await rejection(result)).toMatchObject({
      code: "stream_error",
      retryable: false,
    })
  })

  test("maps response.incomplete to an incomplete error with its reason", async () => {
    const text = `<0f>${object(0)}\n`
    const { result } = run(
      sseResponse(
        sseEvents([
          { type: "response.output_text.delta", ...lane, delta: text },
          {
            type: "response.content_part.done",
            ...lane,
            part: { type: "output_text", text },
          },
          {
            type: "response.incomplete",
            response: { incomplete_details: { reason: "max_output_tokens" } },
          },
        ]),
      ),
    )
    const error = await rejection(result)

    expect(error).toMatchObject({ code: "incomplete", retryable: false })
    expect(String((error as Error).message)).toContain("max_output_tokens")
  })

  test.each([
    [
      "never finalized its text lane",
      [
        { type: "response.output_text.delta", ...lane, delta: "<0f>" },
        { type: "response.completed" },
      ],
    ],
    [
      "finalized text that conflicts with the deltas",
      [
        { type: "response.output_text.delta", ...lane, delta: "<0f>a\n" },
        {
          type: "response.content_part.done",
          ...lane,
          part: { type: "output_text", text: "<0f>b\n" },
        },
        { type: "response.completed" },
      ],
    ],
    [
      "two finalizers that disagree",
      [
        { type: "response.output_text.done", ...lane, text: "<0f>\n" },
        {
          type: "response.content_part.done",
          ...lane,
          part: { type: "output_text", text: "" },
        },
        { type: "response.completed" },
      ],
    ],
    [
      "a second output text lane",
      [
        { type: "response.output_text.delta", ...lane, delta: "<0f>" },
        {
          type: "response.output_text.delta",
          ...lane,
          content_index: 1,
          delta: "<0f>",
        },
        { type: "response.completed" },
      ],
    ],
    [
      "text after its lane was finalized",
      [
        { type: "response.output_text.done", ...lane, text: "" },
        { type: "response.output_text.delta", ...lane, delta: "<0f>" },
        { type: "response.completed" },
      ],
    ],
  ])("rejects a stream that %s", async (_name, events) => {
    const { result } = run(sseResponse(sseEvents(events)))

    expect(await rejection(result)).toMatchObject({
      code: "stream_error",
      retryable: false,
    })
  })

  test("rejects a success response without content-type", async () => {
    const { result } = run(new Response(chunkedBody("data: {}\n\n", 64)))

    expect(await rejection(result)).toMatchObject({ code: "invalid_response" })
  })

  test("rejects an event-stream response without a body", async () => {
    const { result } = run(
      new Response(null, {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      }),
    )

    expect(await rejection(result)).toMatchObject({ code: "invalid_response" })
  })

  test("reads a bounded prefix of a failed HTTP body, then releases it", async () => {
    const cancel = vi.fn()
    // Never closes: only the bound stops the read.
    const body = new ReadableStream<Uint8Array>({
      cancel,
      pull(controller) {
        controller.enqueue(encoder.encode("rate limited ".repeat(100)))
      },
    })
    const { result } = run(new Response(body, { status: 429 }))
    const error = await rejection(result)

    expect(cancel).toHaveBeenCalled()
    expect(error).toMatchObject({ code: "http_error", retryable: true })
    expect((error as Error).message).toMatch(RATE_LIMITED_FAILURE)
  })

  test("leaves a transport failure untyped so the retry policy retries it", async () => {
    const network = new TypeError("fetch failed")
    const { result } = run(() => Promise.reject(network))
    const error = await rejection(result)

    expect(error).not.toBeInstanceOf(SamSegmentationError)
    expect(error).toMatchObject({ cause: network })
  })

  test("aborts the request through the caller's signal", async () => {
    const controller = new AbortController()
    let seen: AbortSignal | undefined
    const { result } = run((request) => {
      seen = request.signal
      controller.abort(new DOMException("deadline", "AbortError"))
      return Promise.reject(request.signal.reason)
    }, controller.signal)
    await rejection(result)

    expect(seen?.aborted).toBe(true)
  })
})
