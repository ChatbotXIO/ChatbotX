import { describe, expect, test } from "vitest"
import { resolveUploadFeedback } from "@/features/facebook-marketing-messages/lib/audience-upload"
import {
  AUDIENCE_MAX_FILE_BYTES,
  audienceFileSchema,
} from "@/features/facebook-marketing-messages/schema/audience"

const UNCERTAIN = "uncertain"
const result = {
  id: "r",
  customAudienceId: "a",
  received: 2,
  skipped: 0,
  invalid: 0,
}
const resolve = (
  mode: "create" | "append",
  outcome: Parameters<typeof resolveUploadFeedback>[0]["outcome"],
  thrownMessage?: string,
) =>
  resolveUploadFeedback({
    mode,
    outcome,
    thrownMessage,
    uncertainMessage: UNCERTAIN,
  })

describe("resolveUploadFeedback", () => {
  test("ok is a success carrying the result without the status tag", () => {
    expect(resolve("create", { status: "ok", ...result })).toEqual({
      kind: "success",
      result,
    })
  })
  test("partial locks create and shows the server message", () => {
    expect(
      resolve("create", { status: "partial", received: 5, message: "partial" }),
    ).toEqual({ kind: "failed", message: "partial", lockUpload: true })
  })
  test("partial in append mode does not lock (retry appends)", () => {
    expect(
      resolve("append", { status: "partial", received: 5, message: "partial" }),
    ).toEqual({ kind: "failed", message: "partial", lockUpload: false })
  })
  test("invalid never locks", () => {
    for (const mode of ["create", "append"] as const) {
      expect(resolve(mode, { status: "invalid", message: "bad file" })).toEqual(
        {
          kind: "failed",
          message: "bad file",
          lockUpload: false,
        },
      )
    }
  })
  test("a thrown error in create mode locks with the uncertain message, never empty", () => {
    expect(resolve("create", undefined)).toEqual({
      kind: "failed",
      message: UNCERTAIN,
      lockUpload: true,
    })
    expect(resolve("create", undefined, "Something went wrong")).toEqual({
      kind: "failed",
      message: UNCERTAIN,
      lockUpload: true,
    })
  })
  test("a thrown error in append mode shows the server message, unlocked", () => {
    expect(resolve("append", undefined, "boom")).toEqual({
      kind: "failed",
      message: "boom",
      lockUpload: false,
    })
    expect(resolve("append", undefined)).toEqual({
      kind: "failed",
      message: UNCERTAIN,
      lockUpload: false,
    })
  })
})

describe("audienceFileSchema (client pre-submit checks)", () => {
  const file = (name: string, size = 10) =>
    new File([new Uint8Array(size)], name, { type: "text/csv" })

  test("accepts csv, txt, xlsx", () => {
    for (const name of ["a.csv", "a.TXT", "a.xlsx"]) {
      expect(audienceFileSchema.safeParse(file(name)).success).toBe(true)
    }
  })
  test("rejects .xls with the fileType key", () => {
    const res = audienceFileSchema.safeParse(file("a.xls"))
    expect(res.success).toBe(false)
    expect(res.error?.issues[0]?.message).toBe("fileType")
  })
  test("rejects files over 20 MB with the fileTooLarge key", () => {
    const res = audienceFileSchema.safeParse(
      file("a.csv", AUDIENCE_MAX_FILE_BYTES + 1),
    )
    expect(res.error?.issues[0]?.message).toBe("fileTooLarge")
  })
})
