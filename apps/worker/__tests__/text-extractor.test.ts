import { describe, expect, test, vi } from "vitest"

const pdfParse = vi.hoisted(() => vi.fn())

vi.mock("pdf-parse-new", () => ({ default: pdfParse }))

import { extractTextFromPdf } from "../src/ai-agent/lib/text-extractor"

describe("extractTextFromPdf", () => {
  test("removes NUL and other control characters before persistence", async () => {
    pdfParse.mockResolvedValue({
      text: "Alpha\0Beta\u0001Gamma\tDelta\r\nEpsilon",
    })

    await expect(extractTextFromPdf(Buffer.from("pdf"))).resolves.toBe(
      "Alpha Beta Gamma Delta\nEpsilon",
    )
  })
})
