export type Emoji = {
  name: string
  fallbackImage?: string
  emoji?: string
}

export type EmojiSelection = {
  name: string
}

export type EmojiListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}
