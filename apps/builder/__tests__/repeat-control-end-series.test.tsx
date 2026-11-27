import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

type MutationOptions = { onSuccess?: () => Promise<void> | void }
const mutations = vi.hoisted(() => ({
  end: undefined as undefined | MutationOptions,
}))
const endMutate = vi.hoisted(() => vi.fn())

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: MutationOptions & { tag?: string }) => {
    if (options.tag === "end") {
      mutations.end = options
    }
    return {
      isPending: false,
      mutate: options.tag === "end" ? endMutate : vi.fn(),
    }
  },
  useQuery: () => ({ data: undefined, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock("@/lib/orpc/query", () => {
  const mutationOptions = (tag: string) => ({
    mutationOptions: (options: object) => ({ ...options, tag }),
  })
  return {
    orpc: {
      socialPostsAPIs: {
        privateEndSocialPostRecurrenceAPI: mutationOptions("end"),
        privatePauseSocialPostRecurrenceAPI: mutationOptions("pause"),
        privateResumeSocialPostRecurrenceAPI: mutationOptions("resume"),
      },
    },
  }
})
vi.mock("../src/features/social-posts/lib/invalidate-social-post", () => ({
  invalidateSocialPost: vi.fn(),
}))
vi.mock(
  "../src/features/social-posts/components/recurrence-occurrences",
  () => ({
    RecurrenceOccurrences: () => null,
  }),
)
vi.mock("@/components/recurrence/recurrence-rule-fields", () => ({
  RecurrenceRuleFields: () => null,
}))

const { RepeatControl, repeatToSend } = await import(
  "../src/features/social-posts/components/repeat-control"
)

const rule = {
  endsOn: null,
  frequency: "daily",
  interval: 1,
  timezone: "UTC",
} as never
const openSeries = {
  nextRunAt: null,
  rule,
  state: "active",
} as never

afterEach(() => {
  mutations.end = undefined
  endMutate.mockReset()
})

describe("ending a repeat series", () => {
  test("clears the editor's rule so a later Save cannot restart the series", async () => {
    const onChange = vi.fn()
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <RepeatControl
            disabled={false}
            onChange={onChange}
            repeat={rule}
            series={openSeries}
            socialPostId="post-1"
            timezone="UTC"
            workspaceId="ws"
          />
        </NextIntlClientProvider>,
      )
    })
    const endButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === messages.composer.repeatEnd,
    )
    expect(endButton).toBeDefined()

    await act(async () => {
      await mutations.end?.onSuccess?.()
    })

    expect(onChange).toHaveBeenCalledWith(null)
    act(() => root.unmount())
    container.remove()
  })

  test("with the rule cleared and the series ended, Save sends no recurrence", () => {
    const ended = { recurrence: { rule, state: "ended" } } as never

    expect(repeatToSend(null, ended)).toBeUndefined()
    // The pre-fix state: the ended series' rule still held by the editor is resent.
    expect(repeatToSend(rule, ended)).toEqual(rule)
  })
})
