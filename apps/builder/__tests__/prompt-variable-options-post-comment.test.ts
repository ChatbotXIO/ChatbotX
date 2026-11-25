import { POST_COMMENT_VARIABLE_NAMES } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { buildPostCommentPromptVariableOptions } from "@/components/tiptap/use-prompt-variable-options"

describe("buildPostCommentPromptVariableOptions", () => {
  const options = buildPostCommentPromptVariableOptions(
    "Post comment",
    (name) => `label:${name}`,
  )

  test("offers every post-comment token, inserted exactly as the resolver reads it", () => {
    expect(options.map((option) => option.value)).toEqual([
      ...POST_COMMENT_VARIABLE_NAMES,
    ])
    expect(options.map((option) => option.value)).toEqual([
      "post.link",
      "post.text",
      "post.published_at",
      "post.page_name",
      "post.id",
      "comment.text",
      "comment.id",
    ])
  })

  test("groups them and leads each label with the group", () => {
    expect(options.every((option) => option.group === "Post comment")).toBe(
      true,
    )
    expect(options[0]?.label).toBe("Post comment › label:post.link")
  })
})
