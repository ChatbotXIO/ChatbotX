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

vi.mock("@/features/ai-agents/provider/ai-agent-store-context", () => ({
  useAIAgentStore: () => [],
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
  options: {
    replyToNewContactsOnly: false,
    replyOncePerUserPerPost: false,
    replyToUsersWhoCommentedOnOtherPosts: true,
    ignoreCommentReplies: true,
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

  test("does not render unsupported private, like, or hide comment controls", () => {
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
    expect(container.textContent).not.toContain(
      "threadsCommentAutomation.hideComments",
    )
  })
})
