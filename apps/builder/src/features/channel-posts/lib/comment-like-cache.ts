type LikableComment = { id: string; liked: boolean }

export type CommentsCache = { pages: { items: LikableComment[] }[] }

/**
 * The cached comment pages with one comment's `liked` flag set. A like only
 * queues a message for the channel and the worker stores the flag later, so
 * the list shows the new state at once instead of refetching the old one.
 * Returns a new object; the input is never mutated.
 */
export const withCommentLiked = <T extends CommentsCache>(
  data: T | undefined,
  commentId: string,
  liked: boolean,
): T | undefined => {
  if (!data) {
    return data
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === commentId ? { ...item, liked } : item,
      ),
    })),
  }
}
