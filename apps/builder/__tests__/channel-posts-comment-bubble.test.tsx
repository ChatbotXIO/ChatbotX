// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  CommentBubble,
  type PostComment,
} from "@/features/channel-posts/components/comment-bubble"

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: () => "Nov 22, 10:00" }),
  useTranslations: () => (key: string) => key,
}))

const contactComment: PostComment = {
  author: {
    avatar: null,
    id: "k1",
    name: "An",
    phoneNumber: "0901234567",
    tags: [{ id: "t1", name: "VIP" }],
  },
  commentId: "c1",
  createdAt: new Date("2026-11-22T10:00:00.000Z"),
  hidden: false,
  id: "m1",
  liked: false,
  page: null,
  parentCommentId: null,
  postId: "p1",
  sender: "contact",
  text: "How much?",
}

const pageComment: PostComment = {
  ...contactComment,
  id: "m2",
  page: { avatar: null, name: "Shop Page" },
  parentCommentId: "m1",
  sender: "page",
  text: "Ten dollars",
}

let root: Root | undefined
let container: HTMLDivElement | undefined

const render = (
  comment: PostComment,
  canLike = true,
  channel = "messenger",
): HTMLElement => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <CommentBubble
        canDelete
        canLike={canLike}
        channel={channel}
        comment={comment}
        likeDisabled={false}
        onDelete={vi.fn()}
        onLike={vi.fn()}
        postCaption={null}
      />,
    )
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("CommentBubble", () => {
  test("a customer's comment sits on the left with their name, initial, phone and tags", () => {
    const view = render(contactComment)
    const bubble = view.querySelector('[data-sender="contact"]')

    expect(bubble?.className).toContain("self-start")
    expect(bubble?.className).not.toContain("flex-row-reverse")
    expect(view.textContent).toContain("An")
    expect(view.textContent).toContain("A")
    expect(view.textContent).toContain("0901234567")
    expect(view.textContent).toContain("VIP")
    expect(
      view.querySelector('[aria-label="posts.comments.like"]'),
    ).not.toBeNull()
  })

  test("a reply the page sent sits on the right under the page's name, with no customer data and no like", () => {
    const view = render(pageComment)
    const bubble = view.querySelector('[data-sender="page"]')

    expect(bubble?.className).toContain("flex-row-reverse")
    expect(bubble?.className).toContain("self-end")
    expect(view.textContent).toContain("Shop Page")
    expect(view.textContent).toContain("Ten dollars")
    expect(view.textContent).not.toContain("0901234567")
    expect(view.textContent).not.toContain("VIP")
    expect(view.querySelector('[aria-label="posts.comments.like"]')).toBeNull()
    expect(
      view.querySelector('[aria-label="posts.comments.delete"]'),
    ).not.toBeNull()
  })

  test("a comment whose contact was deleted shows the unknown-author label", () => {
    const view = render({ ...contactComment, author: null })

    expect(view.textContent).toContain("posts.comments.unknownAuthor")
  })

  test("a page's comment on a channel without a brand mark shows the page's initial, never the contact's", () => {
    const view = render(
      {
        ...pageComment,
        author: {
          avatar: "https://cdn.example/contact.png",
          id: "k1",
          name: "An",
          phoneNumber: null,
          tags: [],
        },
      },
      true,
      "unknown-channel",
    )

    expect(view.querySelector('[aria-hidden="true"]')?.textContent).toBe("S")
    expect(
      view.querySelector('img[src="https://cdn.example/contact.png"]'),
    ).toBeNull()
  })
})
