import { toFinalStepTextStream } from "@chatbotx.io/ai"
import { describe, expect, it } from "vitest"
import { parseRichResponse } from "../src/integration/handlers/rich-response"

const RICH_JSON =
  '{"messages":[{"message":{"text":"Here is what I see."}}],"actions":[]}'

function toStream(parts: { type: string; text?: string }[]) {
  return ReadableStream.from(parts)
}

async function collect(stream: AsyncIterable<string>) {
  let text = ""
  for await (const delta of stream) {
    text += delta
  }
  return text
}

const stepsWithPreface = [
  { type: "start-step" },
  { type: "text-delta", text: "I'll analyze your uploaded image." },
  { type: "tool-call" },
  { type: "tool-result" },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "text-delta", text: RICH_JSON },
  { type: "finish-step" },
]

describe("rich response with prose before a tool call", () => {
  it("fails to parse when every step's text is concatenated (the bug)", () => {
    const concatenated = `I'll analyze your uploaded image.${RICH_JSON}`

    expect(parseRichResponse(concatenated)).toMatchObject({
      ok: false,
      reason: "invalid_json",
    })
  })

  it("parses once only the final step's text is used", async () => {
    const text = await collect(
      toFinalStepTextStream(toStream(stepsWithPreface)),
    )
    const result = parseRichResponse(text)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.messages).toHaveLength(1)
    }
  })
})
