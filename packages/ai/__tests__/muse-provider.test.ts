import {
  MUSE_MAX_TEMPERATURE,
  MUSE_REASONING_HEADROOM_TOKENS,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { providerSdkFactories } from "../src/core/factory"
import {
  createMuse,
  MUSE_BASE_URL,
  transformMuseRequestBody,
} from "../src/core/muse"

describe("transformMuseRequestBody", () => {
  // The SDK always writes the key, with `undefined` when no effort is passed.
  test("defaults to minimal effort below the low-budget threshold", () => {
    const body = transformMuseRequestBody({
      max_tokens: 250,
      reasoning_effort: undefined,
    })

    expect(body.reasoning_effort).toBe("minimal")
  })

  test("defaults to low effort for larger or unset budgets", () => {
    expect(
      transformMuseRequestBody({
        max_tokens: 2048,
        reasoning_effort: undefined,
      }).reasoning_effort,
    ).toBe("low")
    expect(transformMuseRequestBody({}).reasoning_effort).toBe("low")
  })

  test("keeps an explicit reasoning effort", () => {
    const body = transformMuseRequestBody({
      max_tokens: 128,
      reasoning_effort: "high",
    })

    expect(body.reasoning_effort).toBe("high")
  })

  test("adds reasoning headroom so maxOutputTokens stays the text budget", () => {
    const body = transformMuseRequestBody({ max_tokens: 128 })

    expect(body.max_tokens).toBe(128 + MUSE_REASONING_HEADROOM_TOKENS)
  })

  test("caps temperature at the highest value Muse answers reliably", () => {
    expect(transformMuseRequestBody({ temperature: 2 }).temperature).toBe(
      MUSE_MAX_TEMPERATURE,
    )
    expect(transformMuseRequestBody({ temperature: 0.4 }).temperature).toBe(0.4)
    expect(transformMuseRequestBody({})).not.toHaveProperty("temperature")
  })

  test("turns a forced tool choice into auto, the only one Muse accepts", () => {
    const tools = [{ type: "function", function: { name: "select" } }]

    expect(
      transformMuseRequestBody({
        tools,
        tool_choice: { type: "function", function: { name: "select" } },
      }),
    ).toMatchObject({ tools, tool_choice: "auto" })
    expect(
      transformMuseRequestBody({ tools, tool_choice: "required" }).tool_choice,
    ).toBe("auto")
    expect(
      transformMuseRequestBody({ tools, tool_choice: "auto" }).tool_choice,
    ).toBe("auto")
  })

  test("drops the tools for tool choice none", () => {
    const body = transformMuseRequestBody({
      tools: [{ type: "function", function: { name: "select" } }],
      tool_choice: "none",
    })

    expect(body).not.toHaveProperty("tools")
    expect(body).not.toHaveProperty("tool_choice")
  })

  test("does not add max_tokens when the call site sets none", () => {
    expect(transformMuseRequestBody({})).not.toHaveProperty("max_tokens")
  })
})

describe("createMuse", () => {
  test("is the SDK factory registered for the muse provider", () => {
    expect(providerSdkFactories.muse).toBe(createMuse)
  })

  test("targets the Meta Model API chat completions endpoint", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = []
    const muse = createMuse({
      apiKey: "test-key",
      fetch: (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        })
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "chatcmpl-1",
              object: "chat.completion",
              created: 0,
              model: "muse-spark-1.3",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "OK" },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      },
    })

    const result = await muse("muse-spark-1.3").doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      maxOutputTokens: 250,
    })

    expect(result.content).toEqual([{ type: "text", text: "OK" }])
    expect(requests[0]?.url).toBe(`${MUSE_BASE_URL}/chat/completions`)
    expect(requests[0]?.body).toMatchObject({
      model: "muse-spark-1.3",
      reasoning_effort: "minimal",
      max_tokens: 250 + MUSE_REASONING_HEADROOM_TOKENS,
    })
  })
})
