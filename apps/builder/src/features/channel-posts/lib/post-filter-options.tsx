import { channelTypes } from "@chatbotx.io/database/partials"
import type { MultiSelectOption } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { INBOX_ICON_CONFIG } from "@/features/inboxes/components/inbox-icon"
import { channelLabel } from "@/features/inboxes/lib/channel-label"

type OptionIcon = NonNullable<MultiSelectOption["icon"]>

export type PostFilterInbox = {
  channel: string
  id: string
  name: string
}

export type PostFilterAuthor = {
  authorExternalId: string
  authorKey: string
  authorName: string | null
  channel: string
  inboxName: string
}

const AUTHOR_LABEL_SEPARATOR = " · "

const channelIcons = new Map<string, OptionIcon>()

/** Brand icon of a channel as a MultiSelect option icon, built once per channel. */
export const getChannelOptionIcon = (
  channel: string,
): OptionIcon | undefined => {
  const cached = channelIcons.get(channel)
  if (cached) {
    return cached
  }
  const known = channelTypes.safeParse(channel)
  if (!known.success) {
    return
  }
  const { Icon, fill, iconClassName } = INBOX_ICON_CONFIG[known.data]
  const ChannelOptionIcon: OptionIcon = ({ className }) => (
    <Icon
      className={cn(className, iconClassName)}
      {...(fill !== undefined && { fill })}
    />
  )
  channelIcons.set(channel, ChannelOptionIcon)
  return ChannelOptionIcon
}

/** The pages / accounts, each with its channel icon; the channel name is searchable. */
export const buildInboxOptions = (
  inboxes: readonly PostFilterInbox[],
  channels: readonly string[],
): MultiSelectOption[] =>
  inboxes
    .filter(
      (inbox) => channels.length === 0 || channels.includes(inbox.channel),
    )
    .map((inbox) => ({
      channel: inbox.channel,
      icon: getChannelOptionIcon(inbox.channel),
      keywords: [channelLabel(inbox.channel)],
      label: inbox.name,
      value: inbox.id,
    }))

/**
 * One option per (page, author): the value is the author key, so two authors
 * with the same name (or the same person on two pages) stay distinct and a
 * selection filters only that page's posts. The page and channel are searchable.
 */
export const buildAuthorOptions = (
  authors: readonly PostFilterAuthor[],
): MultiSelectOption[] =>
  authors.map((author) => {
    const name = author.authorName ?? author.authorExternalId
    return {
      channel: author.channel,
      icon: getChannelOptionIcon(author.channel),
      keywords: [author.inboxName, channelLabel(author.channel)],
      label: `${name}${AUTHOR_LABEL_SEPARATOR}${author.inboxName}`,
      value: author.authorKey,
    }
  })
