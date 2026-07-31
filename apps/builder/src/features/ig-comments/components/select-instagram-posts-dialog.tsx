"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon, X } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import {
  type InstagramPost,
  splitInstagramMediaPosts,
} from "../provider/ig-comment-posts-store"
import { useIgCommentPostsStore } from "../provider/ig-comment-posts-store-context"

const SKELETON_KEYS = ["sk-1", "sk-2", "sk-3", "sk-4"]
const ALL_PAGES_VALUE = "all"

function PostIdTagInput({
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
  post: InstagramPost
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

function PostGrid({
  posts,
  selectedIds,
  onToggle,
  loading,
  emptyText,
}: {
  posts: InstagramPost[]
  selectedIds: string[]
  onToggle: (id: string) => void
  loading: boolean
  emptyText: string
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
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
    <div className="grid grid-cols-2 gap-2">
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

export function SelectInstagramPostsDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const t = useTranslations()

  const loading = useIgCommentPostsStore((s) => s.loading)
  const posts = useIgCommentPostsStore((s) => s.posts)
  const pages = useIgCommentPostsStore((s) => s.pages)

  const [selectedIds, setSelectedIds] = useState<string[]>(value)
  const [selectedPageId, setSelectedPageId] = useState<string>(ALL_PAGES_VALUE)

  useEffect(() => {
    if (open) {
      setSelectedIds(value)
    }
  }, [open, value])

  const pagePosts =
    selectedPageId === ALL_PAGES_VALUE
      ? posts
      : posts.filter((post) => post.accountId === selectedPageId)
  const instagramMedia = splitInstagramMediaPosts(pagePosts)

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleConfirm = () => {
    onChange(selectedIds)
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("instagramCommentAutomation.selectPosts")}
          </DialogTitle>
        </DialogHeader>

        {pages.length > 0 && (
          <Select
            onValueChange={(val) => setSelectedPageId(val as string)}
            value={selectedPageId}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PAGES_VALUE}>
                {t("instagramCommentAutomation.selectPageAll")}
              </SelectItem>
              {pages.map((page) => (
                <SelectItem key={page.id} value={page.id}>
                  {page.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Tabs defaultValue="published">
          <TabsList className="w-full">
            <TabsTrigger className="flex-1" value="published">
              {t("instagramCommentAutomation.postType.published")}
            </TabsTrigger>
            <TabsTrigger className="flex-1" value="reels">
              {t("instagramCommentAutomation.postType.reels")}
            </TabsTrigger>
            <TabsTrigger className="flex-1" value="postId">
              {t("instagramCommentAutomation.postIdTab")}
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-3" value="published">
            <PostGrid
              emptyText={t("instagramCommentAutomation.noPostsFound")}
              loading={loading}
              onToggle={toggleId}
              posts={instagramMedia.published}
              selectedIds={selectedIds}
            />
          </TabsContent>

          <TabsContent className="mt-3" value="reels">
            <PostGrid
              emptyText={t("instagramCommentAutomation.noPostsFound")}
              loading={loading}
              onToggle={toggleId}
              posts={instagramMedia.reels}
              selectedIds={selectedIds}
            />
          </TabsContent>

          <TabsContent className="mt-3" value="postId">
            <PostIdTagInput
              onChange={setSelectedIds}
              placeholder={t("instagramCommentAutomation.postIdPlaceholder")}
              value={selectedIds}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleConfirm} type="button">
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
