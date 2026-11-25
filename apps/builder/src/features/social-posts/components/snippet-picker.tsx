"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon, SettingsIcon, TextIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { orpc } from "@/lib/orpc/query"
import { useSnippetKindLabels } from "../hooks/use-snippet-kind-labels"
import { SnippetManagerDialog } from "./snippet-manager-dialog"

/**
 * Inserts a text or hashtag snippet into the post text, and chooses the
 * signature the server appends once when a new post is created (it is not
 * written into the editor, so it is never duplicated by an edit).
 */
export const SnippetPicker = ({
  disabled,
  onInsert,
  onSignatureChange,
  signatureEnabled,
  signatureId,
  workspaceId,
}: {
  disabled: boolean
  onInsert: (text: string) => void
  onSignatureChange: (signatureId: string | null) => void
  /** A signature is added when a post is created; an existing post cannot take one. */
  signatureEnabled: boolean
  signatureId: string | null
  workspaceId: string
}) => {
  const t = useTranslations()
  const kindLabels = useSnippetKindLabels()
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const snippets = useQuery(
    orpc.postSnippetsAPIs.privateListPostSnippetsAPI.queryOptions({
      input: { workspaceId },
    }),
  )
  const items = snippets.data?.items ?? []
  const signatures = items.filter((item) => item.kind === "signature")
  const insertable = items.filter((item) => item.kind !== "signature")
  const chosen = signatures.find((item) => item.id === signatureId)

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              disabled={disabled}
              size="sm"
              type="button"
              variant="outline"
            >
              <TextIcon />
              {t("composer.snippets")}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 space-y-2 p-2">
          {snippets.isPending ? (
            <div className="flex justify-center py-3">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {snippets.isError ? (
            <p className="px-1 text-destructive text-sm">
              {t("composer.snippetsLoadFailed")}
            </p>
          ) : null}
          {snippets.data && items.length === 0 ? (
            <p className="px-1 text-muted-foreground text-sm">
              {t("composer.snippetsEmpty")}
            </p>
          ) : null}
          {insertable.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {insertable.map((item) => (
                <li key={item.id}>
                  <button
                    className="flex min-h-9 w-full flex-col items-start rounded-md px-2 py-1.5 text-start text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      onInsert(item.content)
                      setOpen(false)
                    }}
                    type="button"
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="truncate font-medium">{item.name}</span>
                      <Badge variant="outline">{kindLabels[item.kind]}</Badge>
                    </span>
                    <span className="line-clamp-1 text-muted-foreground text-xs">
                      {item.content}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {signatureEnabled && signatures.length > 0 ? (
            <div className="space-y-1 border-t pt-2">
              <p className="px-1 font-medium text-sm">
                {t("composer.snippetsSignature")}
              </p>
              <p className="px-1 text-muted-foreground text-xs">
                {t("composer.snippetsSignatureHint")}
              </p>
              <ul className="space-y-1">
                {signatures.map((item) => (
                  <li key={item.id}>
                    <button
                      aria-pressed={item.id === signatureId}
                      className="flex min-h-9 w-full items-center rounded-md border px-2 py-1.5 text-start text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/10"
                      onClick={() =>
                        onSignatureChange(
                          item.id === signatureId ? null : item.id,
                        )
                      }
                      type="button"
                    >
                      <span className="truncate">{item.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button
            className="w-full justify-start"
            onClick={() => {
              setOpen(false)
              setManaging(true)
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <SettingsIcon />
            {t("composer.snippetsManage")}
          </Button>
        </PopoverContent>
      </Popover>
      {signatureEnabled && chosen ? (
        <Badge className="max-w-40 shrink-0 truncate" variant="secondary">
          {t("composer.snippetsSignatureChosen", { name: chosen.name })}
        </Badge>
      ) : null}
      <SnippetManagerDialog
        onOpenChange={setManaging}
        open={managing}
        workspaceId={workspaceId}
      />
    </>
  )
}
