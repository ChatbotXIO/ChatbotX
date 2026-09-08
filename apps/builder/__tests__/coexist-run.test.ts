// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  type CoexistRowResult,
  summarizeCoexistRun,
} from "@/features/channel-connect/lib/coexist-run"

const done: CoexistRowResult = { status: "done" }
const error = (text = "boom"): CoexistRowResult => ({ status: "error", text })

describe("summarizeCoexistRun", () => {
  test("returns 'none' when nothing succeeded, regardless of anyEnabled", () => {
    expect(summarizeCoexistRun([error(), error()], { anyEnabled: true })).toBe(
      "none",
    )
    expect(summarizeCoexistRun([error(), error()], { anyEnabled: false })).toBe(
      "none",
    )
  })

  test("returns 'disabled' when every target was OFF and every post succeeded", () => {
    expect(summarizeCoexistRun([done, done], { anyEnabled: false })).toBe(
      "disabled",
    )
  })

  test("returns 'none' (not 'disabled') when every target was OFF but one post failed", () => {
    expect(summarizeCoexistRun([done, error()], { anyEnabled: false })).toBe(
      "none",
    )
  })

  test("returns 'enabled' when at least one target was ON and every post succeeded", () => {
    expect(summarizeCoexistRun([done, done], { anyEnabled: true })).toBe(
      "enabled",
    )
  })

  test("still returns 'enabled' when at least one target was ON even if another post failed", () => {
    expect(summarizeCoexistRun([done, error()], { anyEnabled: true })).toBe(
      "enabled",
    )
  })

  test("returns 'none' for an empty run", () => {
    expect(summarizeCoexistRun([], { anyEnabled: true })).toBe("none")
    expect(summarizeCoexistRun([], { anyEnabled: false })).toBe("none")
  })
})
