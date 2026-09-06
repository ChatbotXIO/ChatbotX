import type { AIGenerateImageQualityType } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  getOpenAIEditImageQuality,
  getOpenAIImageQuality,
} from "../src/heavy/handlers/image-options"

describe("OpenAI image options", () => {
  test.each([
    ["auto", "auto"],
    ["ld", "low"],
    ["md", "medium"],
    ["hd", "high"],
  ])("maps GPT Image generate quality %s to %s", (quality, expected) => {
    expect(
      getOpenAIImageQuality(
        "gpt-image-2",
        quality as AIGenerateImageQualityType,
      ),
    ).toBe(expected)
  })

  test("preserves the current OpenAI Edit Image quality contract", () => {
    expect(getOpenAIEditImageQuality("low")).toBe("low")
    expect(getOpenAIEditImageQuality("medium")).toBe("medium")
    expect(getOpenAIEditImageQuality("high")).toBe("high")
    expect(getOpenAIEditImageQuality("ld")).toBe("low")
    expect(getOpenAIEditImageQuality("md")).toBe("medium")
    expect(getOpenAIEditImageQuality("hd")).toBe("high")
  })

  test("rejects unsupported Edit Image quality values", () => {
    expect(() => getOpenAIEditImageQuality("standard")).toThrow(
      "Unsupported OpenAI image quality: standard",
    )
  })

  test("keeps DALL-E quality mapping separate from GPT Image", () => {
    expect(getOpenAIImageQuality("dall-e-3", "md")).toBe("standard")
    expect(getOpenAIImageQuality("dall-e-3", "hd")).toBe("hd")
  })
})
