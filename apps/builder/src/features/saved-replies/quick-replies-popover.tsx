"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { useTranslations } from "next-intl"
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useSavedReplyStore } from "./provider/saved-reply-store-context"

type SavedReplySlashPopoverProps = {
  inputValue: string
  onSelect: (text: string) => void
  children: ReactNode
}

export const QuickRepliesPopover = ({
  inputValue,
  onSelect,
  children,
}: SavedReplySlashPopoverProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const {
    savedReplies,
    isLoading: isLoadingSavedReplies,
    getAllSavedReplies,
  } = useSavedReplyStore((state) => state)

  const normalizedContent = (inputValue ?? "").trimStart()
  const shouldShow = normalizedContent.startsWith("/")
  const keyword = shouldShow
    ? normalizedContent.slice(1).trim().toLowerCase()
    : ""

  const filteredSavedReplies = useMemo(() => {
    if (!keyword) {
      return savedReplies
    }

    return savedReplies.filter((reply) => {
      const shortcut = reply.shortcut.toLowerCase()
      const text = reply.text.toLowerCase()
      return shortcut.includes(keyword) || text.includes(keyword)
    })
  }, [keyword, savedReplies])

  useEffect(() => {
    if (!shouldShow) {
      setOpen(false)
      setActiveIndex(0)
      return
    }

    setOpen(true)
    getAllSavedReplies()
  }, [shouldShow, getAllSavedReplies])

  useEffect(() => {
    if (filteredSavedReplies.length === 0) {
      setActiveIndex(0)
      return
    }

    if (activeIndex >= filteredSavedReplies.length) {
      setActiveIndex(0)
    }
  }, [activeIndex, filteredSavedReplies.length])

  useEffect(() => {
    if (!(open && shouldShow) || filteredSavedReplies.length === 0) {
      return
    }

    const activeOption = optionRefs.current.at(activeIndex)
    activeOption?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    })
  }, [activeIndex, filteredSavedReplies.length, open, shouldShow])

  const onKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!(open && shouldShow)) {
        return
      }

      if (event.nativeEvent.isComposing || event.key === "Process") {
        return
      }

      if (filteredSavedReplies.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault()
          event.stopPropagation()
          setActiveIndex((prev) => (prev + 1) % filteredSavedReplies.length)
          return
        }

        if (event.key === "ArrowUp") {
          event.preventDefault()
          event.stopPropagation()
          setActiveIndex(
            (prev) =>
              (prev - 1 + filteredSavedReplies.length) %
              filteredSavedReplies.length,
          )
          return
        }

        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault()
          event.stopPropagation()
          onSelect(filteredSavedReplies[activeIndex].text)
          setOpen(false)
          setActiveIndex(0)
          return
        }
      }

      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
      }
    },
    [activeIndex, filteredSavedReplies, onSelect, open, shouldShow],
  )

  return (
    <div onKeyDownCapture={onKeyDownCapture}>
      <Popover onOpenChange={setOpen} open={open && shouldShow}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-75 w-100 overflow-y-auto p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
          }}
          side="top"
        >
          {isLoadingSavedReplies ? (
            <div className="px-2 py-3 text-muted-foreground text-sm">
              {t("messages.loadingData")}
            </div>
          ) : null}

          {!isLoadingSavedReplies && filteredSavedReplies.length === 0 ? (
            <div className="px-2 py-3 text-muted-foreground text-sm">
              {t("messages.noDataAvailable")}
            </div>
          ) : null}

          {isLoadingSavedReplies
            ? null
            : filteredSavedReplies.map((reply, index) => (
                <Button
                  className={`flex h-auto w-full flex-col items-start justify-between gap-3 rounded-none border-b px-4 py-3 text-left hover:bg-accent ${
                    index === activeIndex ? "bg-accent" : "hover:bg-accent"
                  }`}
                  key={reply.id}
                  onClick={() => {
                    onSelect(reply.text)
                    setOpen(false)
                    setActiveIndex(0)
                  }}
                  ref={(element) => {
                    optionRefs.current[index] = element
                  }}
                  type="button"
                  variant="ghost"
                >
                  <p className="truncate font-semibold text-sm">
                    {reply.shortcut}
                  </p>
                  <p className="wrap-break-word line-clamp-2 whitespace-normal text-muted-foreground text-xs">
                    {reply.text}
                  </p>
                </Button>
              ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}
