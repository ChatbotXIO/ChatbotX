import { describe, expect, test } from "vitest"
import {
  createTemplateFormSchema,
  VIDEO_PARSE_FAILURE_MESSAGE_KEYS,
} from "@/features/templates/schema/form"

/** Echoes the key, so assertions never depend on the English copy. */
const schema = createTemplateFormSchema((key) => `t:${key}`)

const request = (video: unknown) => ({
  name: "Starter",
  video,
  selection: {},
  defaultPermissions: { allowEdit: true, allowDelete: false },
  createInstallFolder: true,
  defaultAutoUpdate: false,
})

const videoIssues = (source: string) => {
  const result = schema.safeParse(request({ source }))
  return result.success ? [] : result.error.issues
}

describe("template form schema: video", () => {
  test.each([
    "",
    "   ",
    "\n\t ",
  ])("a blank source %j means no video (null), never an error", (source) => {
    const result = schema.safeParse(request({ source }))

    expect(result.success).toBe(true)
    expect(result.data?.video).toBeNull()
  })

  test("a supported link passes and is sent as typed", () => {
    const source = "https://youtu.be/dQw4w9WgXcQ"
    const result = schema.safeParse(request({ source }))

    expect(result.success).toBe(true)
    expect(result.data?.video).toEqual({ source })
  })

  test.each([
    ["https://example.com/video.mp4", "unsupportedProvider"],
    ["not a link", "invalidUrl"],
    ["https://www.youtube.com/watch?v=short", "invalidVideoId"],
    [`https://youtu.be/dQw4w9WgXcQ?${"a=1&".repeat(1100)}`, "tooLong"],
  ] as const)("rejects %s with the translated %s message on video.source", (source, reason) => {
    const issues = videoIssues(source)

    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toEqual(["video", "source"])
    expect(issues[0]?.message).toBe(
      `t:${VIDEO_PARSE_FAILURE_MESSAGE_KEYS[reason]}`,
    )
  })

  test("does not disturb the other fields' validation", () => {
    const result = schema.safeParse({ ...request({ source: "" }), name: "" })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["name"])
  })
})
