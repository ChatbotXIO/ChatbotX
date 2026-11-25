"use client"

import { useTranslations } from "next-intl"
import { CountedToggleGroup } from "@/features/social-posts/components/counted-toggle-group"
import type { PostsListFilter } from "@/features/social-posts/lib/calendar-view-state"
import { POSTS_SHOW_OPTIONS, type PostsShow } from "../lib/posts-show"

const SHOW_LABEL_KEYS = {
  channels: "posts.show.channels",
  drafts: "posts.calendar.list.filters.drafts",
  needsAttention: "posts.calendar.list.filters.needsAttention",
  published: "posts.calendar.list.filters.published",
  scheduled: "posts.calendar.list.filters.scheduled",
} as const satisfies Record<PostsShow, string>

/**
 * The Posts tab's top bar: the posts on the channels (the synced table, no
 * count) or one bucket of composed posts, each with its count.
 */
export const PostsShowBar = ({
  counts,
  onChange,
  show,
}: {
  counts: Record<PostsListFilter, number> | undefined
  onChange: (show: PostsShow) => void
  show: PostsShow
}) => {
  const t = useTranslations()
  return (
    <CountedToggleGroup
      label={t("posts.show.label")}
      onChange={onChange}
      options={POSTS_SHOW_OPTIONS.map((value) => ({
        count: value === "channels" ? undefined : counts?.[value],
        label: t(SHOW_LABEL_KEYS[value]),
        value,
      }))}
      value={show}
    />
  )
}
