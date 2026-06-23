import { describe, expect, test } from "vitest"
import { processTextForImagesAndLinks } from "../src/core/stream"

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
})
