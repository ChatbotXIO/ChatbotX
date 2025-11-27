import { type Ref, useEffect, useImperativeHandle, useState } from "react"
import type { Emoji, EmojiListRef } from "./definition"

export type EmojiListProps = {
  ref: Ref<EmojiListRef>
  items: Emoji[]
  command: (item: Emoji) => void
}

export const EmojiList = ({ ref, ...props }: EmojiListProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]

    if (item) {
      props.command({ name: item.name })
    }
  }

  const upHandler = () => {
    setSelectedIndex(
      (selectedIndex + props.items.length - 1) % props.items.length,
    )
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [])

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (x: { event: KeyboardEvent }) => {
        if (x.event.key === "ArrowUp") {
          upHandler()
          return true
        }

        if (x.event.key === "ArrowDown") {
          downHandler()
          return true
        }

        if (x.event.key === "Enter") {
          enterHandler()
          return true
        }

        return false
      },
    }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: we need to pass the handlers to the useImperativeHandle
    [upHandler, downHandler, enterHandler],
  )

  return (
    <div className="dropdown-menu">
      {props.items.map((item, index) => (
        <button
          className={index === selectedIndex ? "is-selected" : ""}
          // biome-ignore lint/suspicious/noArrayIndexKey: index is unique
          key={index}
          onClick={() => selectItem(index)}
          type="button"
        >
          {item.fallbackImage ? (
            // biome-ignore lint/performance/noImgElement: emoji image
            <img
              alt={item.name}
              className="align-absmiddle"
              height={8}
              src={item.fallbackImage}
              width={8}
            />
          ) : (
            item.emoji
          )}
          :{item.name}:
        </button>
      ))}
    </div>
  )
}
