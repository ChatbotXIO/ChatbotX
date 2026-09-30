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
import { useWorkspaceId } from "@/hooks/routing"
import { useThreadsPosts } from "../hooks/use-threads-posts"

const ALL_ACCOUNTS_VALUE = "all"

export function SelectThreadsPostsDialog({
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
  const { data, isLoading, isError } = useThreadsPosts(useWorkspaceId(), {
    enabled: open,
  })
  const posts = data?.posts ?? []
  const accounts = data?.accounts ?? []

  const [selectedIds, setSelectedIds] = useState<string[]>(value)
  const [selectedAccountId, setSelectedAccountId] =
    useState<string>(ALL_ACCOUNTS_VALUE)

  useEffect(() => {
    if (open) {
      setSelectedIds(value)
    }
  }, [open, value])

  const accountPosts =
    selectedAccountId === ALL_ACCOUNTS_VALUE
      ? posts
      : posts.filter((post) => post.accountId === selectedAccountId)

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
          <DialogTitle>{t("threadsCommentAutomation.selectPosts")}</DialogTitle>
        </DialogHeader>

        {accounts.length > 1 && (
          <Select
            onValueChange={(val) => setSelectedAccountId(val as string)}
            value={selectedAccountId}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACCOUNTS_VALUE}>
                {t("threadsCommentAutomation.selectAccountAll")}
              </SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Tabs defaultValue="posts">
          <TabsList className="w-full">
            <TabsTrigger className="flex-1" value="posts">
              {t("threadsCommentAutomation.postsTab")}
            </TabsTrigger>
            <TabsTrigger className="flex-1" value="postId">
              {t("threadsCommentAutomation.postIdTab")}
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-3" value="posts">
            <PostGrid
              emptyText={
                isError
                  ? t("threadsCommentAutomation.loadPostsError")
                  : t("threadsCommentAutomation.noPostsFound")
              }
              loading={isLoading}
              onToggle={toggleId}
              posts={accountPosts}
              selectedIds={selectedIds}
            />
          </TabsContent>

          <TabsContent className="mt-3" value="postId">
            <PostIdTagInput
              onChange={setSelectedIds}
              placeholder={t("threadsCommentAutomation.postIdPlaceholder")}
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
