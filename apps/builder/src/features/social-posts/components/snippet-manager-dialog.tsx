"use client"

import type { SocialPostSnippetKind } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { ORPCError } from "@orpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import {
  SNIPPET_KINDS,
  useSnippetKindLabels,
} from "../hooks/use-snippet-kind-labels"

const MAX_CONTENT_LENGTH = 2000
const MAX_NAME_LENGTH = 100

type Draft = {
  content: string
  id: string | null
  kind: SocialPostSnippetKind
  name: string
}

const EMPTY_DRAFT: Draft = { content: "", id: null, kind: "text", name: "" }

/** List, create, edit and delete the workspace's post snippets. */
export const SnippetManagerDialog = ({
  onOpenChange,
  open,
  workspaceId,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const kindLabels = useSnippetKindLabels()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const snippets = useQuery(
    orpc.postSnippetsAPIs.privateListPostSnippetsAPI.queryOptions({
      enabled: open,
      input: { workspaceId },
    }),
  )
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.postSnippetsAPIs.privateListPostSnippetsAPI.key(),
    })
  }
  const onError = (error: Error) =>
    toast.error(
      error instanceof ORPCError && error.code === "snippetNameTaken"
        ? t("composer.snippetsNameTaken")
        : error.message,
    )
  const create = useMutation(
    orpc.postSnippetsAPIs.privateCreatePostSnippetAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        await refresh()
        setDraft(EMPTY_DRAFT)
        toast.success(t("composer.snippetsSaved"))
      },
    }),
  )
  const update = useMutation(
    orpc.postSnippetsAPIs.privateUpdatePostSnippetAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        await refresh()
        setDraft(EMPTY_DRAFT)
        toast.success(t("composer.snippetsSaved"))
      },
    }),
  )
  const remove = useMutation(
    orpc.postSnippetsAPIs.privateDeletePostSnippetAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        await refresh()
        toast.success(t("composer.snippetsDeleted"))
      },
    }),
  )

  const name = draft.name.trim()
  const content = draft.content.trim()
  const canSave =
    Boolean(name && content) && !create.isPending && !update.isPending
  const save = () => {
    const body = { content, kind: draft.kind, name, workspaceId }
    if (draft.id) {
      update.mutate({ ...body, id: draft.id })
    } else {
      create.mutate(body)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("composer.snippetsManage")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSave) {
              save()
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="snippet-name">{t("composer.snippetsName")}</Label>
              <Input
                id="snippet-name"
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                value={draft.name}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="snippet-kind">{t("composer.snippetsKind")}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="snippet-kind"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    kind: event.target.value as SocialPostSnippetKind,
                  })
                }
                value={draft.kind}
              >
                {SNIPPET_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabels[kind]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="snippet-content">
              {t("composer.snippetsContent")}
            </Label>
            <Textarea
              id="snippet-content"
              maxLength={MAX_CONTENT_LENGTH}
              onChange={(event) =>
                setDraft({ ...draft, content: event.target.value })
              }
              rows={4}
              value={draft.content}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={!canSave} size="sm" type="submit">
              {draft.id ? t("actions.save") : t("composer.snippetsAdd")}
            </Button>
            {draft.id ? (
              <Button
                onClick={() => setDraft(EMPTY_DRAFT)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
            ) : null}
          </div>
        </form>
        {snippets.isError ? (
          <p className="text-destructive text-sm">
            {t("composer.snippetsLoadFailed")}
          </p>
        ) : null}
        {snippets.data?.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("composer.snippetsEmpty")}
          </p>
        ) : null}
        <ul className="space-y-1">
          {snippets.data?.items.map((item) => (
            <li
              className="flex items-center gap-2 rounded-md border px-2 py-1.5"
              key={item.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  {item.name}{" "}
                  <span className="font-normal text-muted-foreground text-xs">
                    {kindLabels[item.kind]}
                  </span>
                </p>
                <p className="line-clamp-1 text-muted-foreground text-xs">
                  {item.content}
                </p>
              </div>
              <Button
                aria-label={t("actions.edit")}
                onClick={() =>
                  setDraft({
                    content: item.content,
                    id: item.id,
                    kind: item.kind,
                    name: item.name,
                  })
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <PencilIcon />
              </Button>
              <Button
                aria-label={t("actions.delete")}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: item.id, workspaceId })}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
