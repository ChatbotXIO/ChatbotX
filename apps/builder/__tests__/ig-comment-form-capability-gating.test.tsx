import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { IgCommentForm } from "@/features/ig-comments/components/ig-comment-form"
import type {
  CreateIgCommentRequest,
  IgCommentVariant,
} from "@/features/ig-comments/schema/action"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/features/flows/provider/flow-hook", () => ({
  useFlowSelectOptions: () => [],
}))

vi.mock("@/features/ai-agents/provider/ai-agent-store-context", () => ({
  useAIAgentStore: () => [],
}))

// The rich-text body isn't under test here (only capability gating is);
// mounting the real Tiptap/ProseMirror editor needs DOM APIs jsdom lacks
// (e.g. Range.getClientRects, elementFromPoint).
vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: ({ name }: { name: string }) => (
    <div data-testid={`tiptap-${name}`} />
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/form", async () => {
  const { FormProvider } = await import("react-hook-form")
  return {
    Form: FormProvider,
    FormControl: ({ children }: { children: React.ReactNode }) => children,
    FormField: ({
      render,
    }: {
      render: (props: { field: Record<string, unknown> }) => React.ReactNode
    }) => render({ field: {} }),
    FormItem: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    FormLabel: ({ children }: { children: React.ReactNode }) => (
      <span>{children}</span>
    ),
    FormMessage: () => null,
  }
})

// jsdom ships no ResizeObserver, and Radix measures controls through it.
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

const BASE_VALUES: CreateIgCommentRequest = {
  name: "",
  type: "instagram",
  folderId: undefined,
  post: { type: "all", value: [] },
  privateReply: { type: "text", value: "" },
  publicReply: { type: "none", value: null },
  includeKeywords: { type: "all", value: [] },
  excludeKeywords: [],
  options: {
    replyToNewContactsOnly: false,
    replyOncePerUserPerPost: false,
    likeUserComment: false,
    replyToUsersWhoCommentedOnOtherPosts: true,
    ignoreCommentReplies: true,
    trackUserTags: false,
  },
  hideComments: {
    all: false,
    hasPhoneNumber: false,
    hasImage: false,
    hasVideo: false,
    hasLink: false,
    hasKeywords: false,
    keywords: [],
    showCommentsAfter: "none",
  },
  replyAfter: { type: "immediately", value: 0 },
}

function Harness({ variant }: { variant: IgCommentVariant }) {
  const form = useForm<CreateIgCommentRequest>({
    defaultValues: { ...BASE_VALUES, type: variant },
  })

  return (
    <FormProvider {...form}>
      <IgCommentForm
        form={form}
        isSubmitting={false}
        onCancel={() => undefined}
        onSubmit={(e) => e.preventDefault()}
        submitLabel="submit"
        variant={variant}
      />
    </FormProvider>
  )
}

describe("IgCommentForm capability gating", () => {
  let container: HTMLDivElement
  let root: Root

  const renderVariant = (variant: IgCommentVariant) => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(<Harness variant={variant} />)
    })
  }

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("instagram (Instagram Business): hides like-comment entirely, not just disables it", () => {
    renderVariant("instagram")

    expect(container.textContent).not.toContain(
      "instagramCommentAutomation.options.likeUserComment",
    )
  })

  test("instagramFacebook: shows the like-comment option", () => {
    renderVariant("instagramFacebook")

    expect(container.textContent).toContain(
      "instagramCommentAutomation.options.likeUserComment",
    )
  })

  test("hasImage/hasVideo hide-comment criteria are hidden for both variants (no attachment detection for Instagram)", () => {
    renderVariant("instagram")
    expect(container.textContent).not.toContain(
      "instagramCommentAutomation.hideComments.hasImage",
    )
    expect(container.textContent).not.toContain(
      "instagramCommentAutomation.hideComments.hasVideo",
    )

    act(() => {
      root.unmount()
    })
    container.remove()

    renderVariant("instagramFacebook")
    expect(container.textContent).not.toContain(
      "instagramCommentAutomation.hideComments.hasImage",
    )
    expect(container.textContent).not.toContain(
      "instagramCommentAutomation.hideComments.hasVideo",
    )
  })
})
