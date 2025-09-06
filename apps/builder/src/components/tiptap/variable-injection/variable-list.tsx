import { Button } from "@aha.chat/ui/components/ui/button"
import "./variable-list.css"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aha.chat/ui/components/ui/command"
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion"
import type { LucideIcon } from "lucide-react"
import { type RefObject, useEffect, useImperativeHandle, useState } from "react"

type VariableItem = { value: string; label: string; icon: LucideIcon }

export type VariableListRef = {
  // For convenience using this SuggestionList from within the
  // mentionSuggestionOptions, we'll match the signature of SuggestionOptions's
  // `onKeyDown` returned in its `render` function
  onKeyDown: NonNullable<
    ReturnType<
      NonNullable<SuggestionOptions<VariableItem, { id: string }>["render"]>
    >["onKeyDown"]
  >
}

export type VariableListProps = SuggestionProps<
  VariableItem,
  { id: string }
> & {
  ref: RefObject<{
    onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean
  }>
}

export default (props: VariableListProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]

    if (item) {
      props.command({ id: `${item.value}}}` })
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

  useImperativeHandle(props.ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler()
        return true
      }

      if (event.key === "ArrowDown") {
        downHandler()
        return true
      }

      if (event.key === "Enter") {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <div className="cursor-pointer border border-secondary">
      {props.items.length ? (
        <Command>
          <CommandInput placeholder="Search variable..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {props.items.map((item, index) => (
                <CommandItem asChild key={item.value}>
                  <Button
                    className="w-full justify-start"
                    onClick={() => selectItem(index)}
                    variant="ghost"
                  >
                    <item.icon /> {item.label}
                  </Button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      ) : (
        <div className="item">No result</div>
      )}
    </div>
  )
}
