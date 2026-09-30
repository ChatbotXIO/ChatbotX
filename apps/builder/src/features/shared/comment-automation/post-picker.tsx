"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon, X } from "lucide-react"
import Image from "next/image"
import { type KeyboardEvent, useRef, useState } from "react"

/** The fields every channel's post picker renders. */
export type PickerPost = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
}

const SKELETON_KEYS = ["sk-1", "sk-2", "sk-3", "sk-4"]

export function PostIdTagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  placeholder: string
}) {
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = (raw: string) => {
    const id = raw.trim()
    if (!id || value.includes(id)) {
      return
    }
    onChange([...value, id])
    setInputValue("")
  }

  const removeTag = (id: string) => {
    onChange(value.filter((v) => v !== id))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value.at(-1) as string)
    }
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 outline-none transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {value.map((id) => (
        <Badge
          className="flex items-center gap-1 pe-1"
          key={id}
          variant="secondary"
        >
          <span className="max-w-50 truncate font-mono text-xs">{id}</span>
          <button
            className="ms-1 rounded-full p-0.5 transition-colors hover:bg-destructive/20"
            onClick={() => removeTag(id)}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        className="h-7 min-w-30 flex-1 border-0 bg-transparent p-0 font-mono text-sm shadow-none focus-visible:ring-0"
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        ref={inputRef}
        value={inputValue}
      />
    </div>
  )
}

function PostCard({
  post,
  selected,
  onToggle,
}: {
  post: PickerPost
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      className={cn(
        "relative w-full cursor-pointer rounded-md border p-2 text-start transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted",
      )}
      onClick={onToggle}
      type="button"
    >
      {selected && (
        <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="h-3 w-3" />
        </span>
      )}
      {post.full_picture && (
        <Image
          alt=""
          className="mb-2 h-24 w-full rounded object-cover"
          height={96}
          src={post.full_picture}
          width={300}
        />
      )}
      <p className="line-clamp-2 text-muted-foreground text-sm">
        {post.message ?? "—"}
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        {new Date(post.created_time).toLocaleDateString()}
      </p>
    </button>
  )
}

export function PostGrid({
  posts,
  selectedIds,
  onToggle,
  loading,
  emptyText,
}: {
  posts: PickerPost[]
  selectedIds: string[]
  onToggle: (id: string) => void
  loading: boolean
  emptyText: string
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SKELETON_KEYS.map((key) => (
          <Skeleton className="h-36 w-full rounded-md" key={key} />
        ))}
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        {emptyText}
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          onToggle={() => onToggle(post.id)}
          post={post}
          selected={selectedIds.includes(post.id)}
        />
      ))}
    </div>
  )
}
