import { describe, expect, test } from "vitest"
import {
  processStreamingText,
  processTextForImagesAndLinks,
  toStepSeparatedTextStream,
} from "../src/core/stream"

function streamParts(parts: { type: string; text?: string }[]) {
  return ReadableStream.from(parts)
}

async function collect(stream: AsyncIterable<string>) {
  let text = ""
  for await (const delta of stream) {
    text += delta
  }
  return text
}

describe("stream text processing", () => {
  test("keeps image URLs at their text position", () => {
    const parts = processTextForImagesAndLinks(
      [
        "1. *Áo sơ mi nam*",
        "- *Giá:* 340.000đ",
        "https://cdn.example.com/white-shirt.jpg",
        "",
        "2. *Áo thun Navy*",
        "- *Giá:* 230.000đ",
        "https://cdn.example.com/navy-shirt.png",
      ].join("\n"),
    )

    expect(parts).toEqual([
      "1. Áo sơ mi nam\n- Giá: 340.000đ",
      "https://cdn.example.com/white-shirt.jpg",
      "2. Áo thun Navy\n- Giá: 230.000đ",
      "https://cdn.example.com/navy-shirt.png",
    ])
  })

  test("removes markdown emphasis from text parts", () => {
    const parts = processTextForImagesAndLinks(
      "1. **Áo sơ mi nam**\n- *Giá:* 340.000đ",
    )

    expect(parts).toEqual(["1. Áo sơ mi nam\n- Giá: 340.000đ"])
  })

  test("separates text written before and after a tool call", async () => {
    const stream = toStepSeparatedTextStream(
      streamParts([
        { type: "start-step" },
        { type: "text-delta", text: "I'll record your refund request." },
        { type: "tool-call" },
        { type: "tool-result" },
        { type: "finish-step" },
        { type: "start-step" },
        { type: "text-delta", text: "I've noted" },
        { type: "text-delta", text: " your refund request." },
        { type: "finish-step" },
      ]),
    )
    const segments: string[] = []

    const { fullText } = await processStreamingText(stream, (segment) => {
      segments.push(segment)
      return Promise.resolve()
    })

    expect(fullText).toBe(
      "I'll record your refund request.\n\nI've noted your refund request.",
    )
    expect(segments).toEqual([
      "I'll record your refund request.",
      "I've noted your refund request.",
    ])
  })

  test("adds no break when only one step has text", async () => {
    const text = await collect(
      toStepSeparatedTextStream(
        streamParts([
          { type: "start-step" },
          { type: "tool-call" },
          { type: "finish-step" },
          { type: "start-step" },
          { type: "text-delta", text: "Your order ships " },
          { type: "text-delta", text: "tomorrow." },
          { type: "finish-step" },
          { type: "start-step" },
          { type: "finish-step" },
        ]),
      ),
    )

    expect(text).toBe("Your order ships tomorrow.")
  })

  test("sends text written before a tool call only after the tool ran", async () => {
    const events: string[] = []
    const runTool = () => {
      events.push("tool executed")
      return Promise.resolve()
    }
    async function* parts() {
      yield { type: "start-step" }
      yield { type: "text-delta", text: "Checking.\n\nOne moment" }
      await runTool()
      yield { type: "tool-result" }
      yield { type: "finish-step" }
      yield { type: "start-step" }
      yield { type: "text-delta", text: "Done." }
      events.push("next step text")
      yield { type: "finish-step" }
    }

    await processStreamingText(
      toStepSeparatedTextStream(parts()),
      (segment) => {
        events.push(`send: ${segment}`)
        return Promise.resolve()
      },
    )

    expect(events).toEqual([
      "send: Checking.",
      "tool executed",
      "send: One moment",
      "next step text",
      "send: Done.",
    ])
  })
})
