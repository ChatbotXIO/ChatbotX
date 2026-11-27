// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  decodeSelectableCursor,
  encodeSelectableCursor,
} from "../src/template/selectable-cursor"

const KEYWORD_KEY = "2026-10-30 10:15:30.123456+00"
const BIGINT_MAX = "9223372036854775807"

const invalid = { code: "invalidCursor", httpStatusCode: 400 }

describe("selectable cursor", () => {
  test("round-trips a name key and a timestamp key", () => {
    expect(
      decodeSelectableCursor(encodeSelectableCursor({ key: "Café", id: "42" })),
    ).toEqual({ kind: "after", after: { key: "Café", id: "42" } })
    expect(
      decodeSelectableCursor(
        encodeSelectableCursor({ key: KEYWORD_KEY, id: BIGINT_MAX }),
        "timestamp",
      ),
    ).toEqual({ kind: "after", after: { key: KEYWORD_KEY, id: BIGINT_MAX } })
  })

  test("legacy offsets still resolve; absurd ones do not reach the query", () => {
    expect(decodeSelectableCursor("100")).toEqual({
      kind: "offset",
      offset: 100,
    })
    expect(() => decodeSelectableCursor("9".repeat(30))).toThrow(
      expect.objectContaining(invalid),
    )
  })

  test("an id beyond bigint is a 400, not a database error", () => {
    for (const id of ["9223372036854775808", "9".repeat(20), "9".repeat(400)]) {
      expect(() =>
        decodeSelectableCursor(encodeSelectableCursor({ key: "a", id })),
      ).toThrow(expect.objectContaining(invalid))
    }
  })

  test("a keywords key that is not a castable timestamp is a 400", () => {
    for (const key of [
      "not a date",
      "2026-13-45 10:00:00+00",
      "2026-10-30",
      "2026-10-30 10:15:30.123456+00; drop table x",
      "",
    ]) {
      expect(() =>
        decodeSelectableCursor(
          encodeSelectableCursor({ key, id: "5" }),
          "timestamp",
        ),
      ).toThrow(expect.objectContaining(invalid))
    }
  })

  test("a name key may be any text but not a NUL, which Postgres rejects", () => {
    expect(
      decodeSelectableCursor(
        encodeSelectableCursor({ key: "not a date", id: "5" }),
      ),
    ).toMatchObject({ kind: "after" })
    expect(() =>
      decodeSelectableCursor(
        encodeSelectableCursor({ key: "a\u0000b", id: "5" }),
      ),
    ).toThrow(expect.objectContaining(invalid))
  })

  test("garbage is a 400", () => {
    for (const cursor of ["%%%", "bm90LWpzb24", "W10", "W1siYSIsMV1d"]) {
      expect(() => decodeSelectableCursor(cursor)).toThrow(
        expect.objectContaining(invalid),
      )
    }
  })
})
