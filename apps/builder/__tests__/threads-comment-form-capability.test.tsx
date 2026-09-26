import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ThreadsCommentForm } from "@/features/threads-comments/components/threads-comment-form"
import type { CreateThreadsCommentRequest } from "@/features/threads-comments/schema/action"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/features/flows/provider/flow-hook", () => ({
  useFlowSelectOptions: () => [],
}))

vi.mock("@/features/ai-agents/hooks/use-ai-agents", () => ({
  useAIAgentSelectOptions: () => ({ options: [], isError: false }),
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

const baseValues: CreateThreadsCommentRequest = {
  name: "",
  post: { type: "all", value: [] },
  publicReply: { type: "none", value: null },
  includeKeywords: { type: "all", value: [] },
  excludeKeywords: [],
  excludeKeywordsType: "contain",
  options: {
    replyToNewContactsOnly: false,
    replyOncePerUserPerPost: false,
    replyToUsersWhoCommentedOnOtherPosts: true,
    ignoreCommentReplies: true,
    trackUserTags: false,
  },
  hideComments: {
    all: false,
    hasPhoneNumber: false,
    hasLink: false,
    hasKeywords: false,
    hasGif: false,
    hasEmoji: false,
    keywords: [],
    showCommentsAfter: "none",
  },
  replyAfter: { type: "immediately", value: 0 },
}

function Harness() {
  const form = useForm<CreateThreadsCommentRequest>({
    defaultValues: baseValues,
  })

  return (
    <FormProvider {...form}>
      <ThreadsCommentForm
        form={form}
        isSubmitting={false}
        onCancel={() => undefined}
        onSubmit={(event) => event.preventDefault()}
        submitLabel="submit"
      />
    </FormProvider>
  )
}

describe("ThreadsCommentForm capability gating", () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("does not render unsupported private or like controls", () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(<Harness />)
    })

    expect(container.textContent).toContain(
      "threadsCommentAutomation.publicOnlyNote",
    )
    expect(container.textContent).not.toContain(
      "threadsCommentAutomation.privateReply",
    )
    expect(container.textContent).not.toContain(
      "threadsCommentAutomation.options.likeUserComment",
    )
  })

  // Threads hides top-level replies via `manage_reply`, and exposes a reply's
  // `gif_url` — but has no image/video attachment lookup.
  test("renders hide comments with GIF and emoji, without image or video", () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(<Harness />)
    })

    expect(container.textContent).toContain(
      "threadsCommentAutomation.card.hideComments",
    )
    expect(container.textContent).toContain(
      "commentAutomation.hideComments.hasGif",
    )
    expect(container.textContent).toContain(
      "commentAutomation.hideComments.hasEmoji",
    )
    expect(container.textContent).not.toContain("hideComments.hasImage")
    expect(container.textContent).not.toContain("hideComments.hasVideo")
    expect(container.textContent).toContain(
      "commentAutomation.trackUserTags.label",
    )
  })

  // One field: the label, a two-option radio for the match type, and the
  // keyword tags right below — no separate "match type" select.
  test("renders exclude keywords as one radio-group field", () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(<Harness />)
    })

    expect(container.textContent).toContain(
      "threadsCommentAutomation.excludeKeywords",
    )
    expect(container.textContent).toContain(
      "commentAutomation.excludeKeywordsType.equal",
    )
    expect(container.textContent).toContain(
      "commentAutomation.excludeKeywordsType.contain",
    )
    expect(container.textContent).not.toContain(
      "commentAutomation.excludeKeywordsType.label",
    )
    expect(
      container.querySelectorAll('[role="radio"][value="equal"]').length +
        container.querySelectorAll('input[type="radio"][value="equal"]').length,
    ).toBeGreaterThan(0)
  })
})
