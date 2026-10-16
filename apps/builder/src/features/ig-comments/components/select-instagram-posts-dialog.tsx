"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  PostGrid,
  PostIdTagInput,
} from "@/features/shared/comment-automation/post-picker"
import { splitInstagramMediaPosts } from "../provider/ig-comment-posts-store"
import { useIgCommentPostsStore } from "../provider/ig-comment-posts-store-context"

const ALL_PAGES_VALUE = "all"

export function SelectInstagramPostsDialog({
  open,
  onOpenChange,
  value,
  onChange,
  inboxId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string[]
  onChange: (ids: string[]) => void
  /** The automation's account; set, only that account's media is offered. */
  inboxId?: string | null
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

  let pagePosts = posts
  if (inboxId) {
    pagePosts = posts.filter((post) => post.inboxId === inboxId)
  } else if (selectedPageId !== ALL_PAGES_VALUE) {
    pagePosts = posts.filter((post) => post.accountId === selectedPageId)
  }
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("instagramCommentAutomation.selectPosts")}
          </DialogTitle>
        </DialogHeader>

        {pages.length > 0 && !inboxId && (
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
