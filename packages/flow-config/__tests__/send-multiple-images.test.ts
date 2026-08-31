import { describe, expect, test } from "vitest"
import {
  sendMultipleImagesItemDefaultFn,
  sendMultipleImagesStepDefaultFn,
  sendMultipleImagesStepSchema,
} from "../src/steps/send-multiple-images"

const baseStep = {
  id: "step-1",
  stepType: "sendMultipleImages" as const,
}

describe("sendMultipleImagesStepSchema", () => {
  test("accepts 2 images (min)", () => {
    const result = sendMultipleImagesStepSchema.safeParse({
      ...baseStep,
      images: [
        { id: "img-1", mode: "url", url: "https://example.com/a.png" },
        { id: "img-2", mode: "url", url: "https://example.com/b.png" },
      ],
    })
    expect(result.success).toBe(true)
  })

  test("accepts 10 images (max)", () => {
    const images = Array.from({ length: 10 }, (_, i) => ({
      id: `img-${i}`,
      mode: "url" as const,
      url: `https://example.com/${i}.png`,
    }))
    const result = sendMultipleImagesStepSchema.safeParse({
      ...baseStep,
      images,
    })
    expect(result.success).toBe(true)
  })

  test("rejects fewer than 2 images", () => {
    const result = sendMultipleImagesStepSchema.safeParse({
      ...baseStep,
      images: [{ id: "img-1", mode: "url", url: "https://example.com/a.png" }],
    })
    expect(result.success).toBe(false)
  })

  test("rejects more than 10 images", () => {
    const images = Array.from({ length: 11 }, (_, i) => ({
      id: `img-${i}`,
      mode: "url" as const,
      url: `https://example.com/${i}.png`,
    }))
    const result = sendMultipleImagesStepSchema.safeParse({
      ...baseStep,
      images,
    })
    expect(result.success).toBe(false)
  })

  test("accepts a {{variable}} placeholder per item, resolved at send time", () => {
    const result = sendMultipleImagesStepSchema.safeParse({
      ...baseStep,
      images: [
        { id: "img-1", mode: "url", url: "{{customField}}" },
        { id: "img-2", mode: "url", url: "https://example.com/b.png" },
      ],
    })
    expect(result.success).toBe(true)
  })

  test("rejects an item with an invalid (non-placeholder, non-URL) url", () => {
    const result = sendMultipleImagesStepSchema.safeParse({
      ...baseStep,
      images: [
        { id: "img-1", mode: "url", url: "not-a-url" },
        { id: "img-2", mode: "url", url: "https://example.com/b.png" },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe("sendMultipleImagesItemDefaultFn", () => {
  test("defaults to file mode with an empty url", () => {
    const item = sendMultipleImagesItemDefaultFn()
    expect(item.mode).toBe("file")
    expect(item.url).toBe("")
  })

  test("two calls produce different ids", () => {
    const a = sendMultipleImagesItemDefaultFn()
    const b = sendMultipleImagesItemDefaultFn()
    expect(a.id).not.toBe(b.id)
  })
})

describe("sendMultipleImagesStepDefaultFn", () => {
  test("stepType is sendMultipleImages", () => {
    const step = sendMultipleImagesStepDefaultFn()
    expect(step.stepType).toBe("sendMultipleImages")
  })

  test("seeds exactly 2 empty image slots (the schema minimum)", () => {
    const step = sendMultipleImagesStepDefaultFn()
    expect(step.images).toHaveLength(2)
  })

  test("id is always generated (non-empty string)", () => {
    const step = sendMultipleImagesStepDefaultFn()
    expect(typeof step.id).toBe("string")
    expect(step.id.length).toBeGreaterThan(0)
  })
})
