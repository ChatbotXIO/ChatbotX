import { describe, expect, test } from "vitest"
import { sanitizeFileName } from "../src/sanitize-file-name"

describe("sanitizeFileName", () => {
  test.each([
    ["CMND mặt trước.JPG", "cmnd-mat-truoc.jpg"],
    ["Đơn đăng ký (1).pdf", "don-dang-ky-1.pdf"],
    ["../../etc/passwd", "etc-passwd"],
    ["  spaced   name .pdf", "spaced-name.pdf"],
    ["mix--ed__name..PDF", "mix-ed__name.pdf"],
  ])("%j becomes %j", (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected)
  })

  test.each([
    ["###.png", "file.png"],
    ["名前.pdf", "file.pdf"],
    ["", "file"],
  ])("a name with nothing usable left (%j) becomes %j", (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected)
  })

  test("keeps at most 80 characters, extension included, without a dangling dash", () => {
    // The cut lands right after "a…a-", so the dash it leaves is dropped.
    const name = sanitizeFileName(`${"a".repeat(74)} b c d.jpeg`)

    expect(name).toBe(`${"a".repeat(74)}.jpeg`)
    expect(sanitizeFileName(`${"x".repeat(200)}.jpeg`)).toBe(
      `${"x".repeat(75)}.jpeg`,
    )
  })
})
