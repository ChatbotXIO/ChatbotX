"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { createSavedReplyAction } from "./actions/create-saved-reply.action"
import { editSavedReplyAction } from "./actions/edit-saved-reply.action"
import {
  createSavedReplyRequest,
  MAX_FILES_PER_SNIPPET,
  MAX_TOPICS_PER_SNIPPET,
  type SnippetFile,
} from "./schema/mutation"
import type { SavedReplyResource } from "./schema/resource"

type SnippetFormDialogProps = {
  workspaceId: string
  // Quando `snippet` está presente o dialog opera em modo edit; senão create.
  snippet?: SavedReplyResource | null
  open?: boolean
  onOpenChange?: (val: boolean) => void
}

export function SnippetFormDialog({
  workspaceId,
  snippet,
  open: controlledOpen,
  onOpenChange,
}: SnippetFormDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const isEdit = !!snippet
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const isControlled = controlledOpen !== undefined
  const showTrigger = !(isControlled || isEdit)

  const createForm = useHookFormAction(
    createSavedReplyAction.bind(null, workspaceId),
    zodResolver(createSavedReplyRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", { feature: t("snippets.feature") }),
          )
          setOpen(false)
          createForm.resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }: { error: { serverError?: string } }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          shortcut: "",
          text: "",
          topics: [],
          files: [],
        },
      },
      errorMapProps: {},
    },
  )

  const editForm = useHookFormAction(
    editSavedReplyAction.bind(null, workspaceId, snippet?.id ?? ""),
    zodResolver(createSavedReplyRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", { feature: t("snippets.feature") }),
          )
          setOpen(false)
          editForm.resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }: { error: { serverError?: string } }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: { mode: "onChange" },
      errorMapProps: {},
    },
  )

  const { form, handleSubmitWithAction, resetFormAndAction } = isEdit
    ? editForm
    : createForm

  useEffect(() => {
    if (isEdit && snippet) {
      const s = snippet as unknown as {
        name?: string | null
        shortcut: string
        text: string
        topics?: string[]
        files?: SnippetFile[]
      }
      editForm.form.reset({
        name: s.name ?? "",
        shortcut: s.shortcut,
        text: s.text,
        topics: s.topics ?? [],
        files: s.files ?? [],
      })
    }
  }, [isEdit, snippet, editForm.form])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) {
        resetFormAndAction()
      }
    },
    [setOpen, resetFormAndAction],
  )

  const title = isEdit
    ? t("messages.editFeature", { feature: t("snippets.feature") })
    : t("snippets.createTitle")

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button size="sm">
            <PlusIcon />
            {t("snippets.addButton")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("snippets.formDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            {/* Nome descritivo (paridade Respond.io) — opcional. Diferente do
                atalho, fica visível na tabela pra identificar snippet. */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("snippets.nameLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("snippets.namePlaceholder")}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="shortcut"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("snippets.shortcutLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("snippets.shortcutPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="topics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("snippets.topicsLabel")}{" "}
                    <span className="text-text-tertiary text-xs">
                      ({(field.value ?? []).length}/{MAX_TOPICS_PER_SNIPPET})
                    </span>
                  </FormLabel>
                  <FormControl>
                    <TopicsInput
                      max={MAX_TOPICS_PER_SNIPPET}
                      onChange={field.onChange}
                      value={field.value ?? []}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("snippets.messageLabel")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("snippets.messagePlaceholder")}
                      rows={6}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="files"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("snippets.filesLabel")}{" "}
                    <span className="text-text-tertiary text-xs">
                      ({(field.value ?? []).length}/{MAX_FILES_PER_SNIPPET})
                    </span>
                  </FormLabel>
                  <FormControl>
                    <FilesList
                      max={MAX_FILES_PER_SNIPPET}
                      onChange={field.onChange}
                      value={field.value ?? []}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {isEdit ? t("actions.confirm") : t("snippets.createConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Editor de tópicos inline ─────────────────────────────────────────
// Input + chips com X. Enter adiciona. Dedup automático. Respeita max.
function TopicsInput({
  value,
  onChange,
  max,
}: {
  value: string[]
  onChange: (next: string[]) => void
  max: number
}) {
  const t = useTranslations()
  const [draft, setDraft] = useState("")
  const reachedLimit = value.length >= max

  const handleAdd = () => {
    const trimmed = draft.trim().toLowerCase()
    if (!trimmed || value.includes(trimmed) || reachedLimit) {
      setDraft("")
      return
    }
    onChange([...value, trimmed])
    setDraft("")
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          disabled={reachedLimit}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            reachedLimit
              ? t("snippets.topicsLimitReached")
              : t("snippets.topicsPlaceholder")
          }
          value={draft}
        />
        <Button
          disabled={!draft.trim() || reachedLimit}
          onClick={handleAdd}
          size="icon"
          type="button"
          variant="outline"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((topic) => (
            <Badge
              className="gap-1 py-0.5 pr-1 pl-2.5 text-xs"
              key={topic}
              variant="secondary"
            >
              <span>{topic}</span>
              <button
                aria-label={t("actions.remove")}
                className="rounded-sm p-0.5 hover:bg-white/10"
                onClick={() => onChange(value.filter((v) => v !== topic))}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Lista de arquivos anexados ──────────────────────────────────────
// Hoje usa Input file simples local (gera blob URL) — placeholder até
// integrar com presigned upload S3 (próximo: usar DirectUploadButton).
function FilesList({
  value,
  onChange,
  max,
}: {
  value: SnippetFile[]
  onChange: (next: SnippetFile[]) => void
  max: number
}) {
  const t = useTranslations()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const reachedLimit = value.length >= max

  const handlePick = (files: FileList | null) => {
    if (!files) {
      return
    }
    const remaining = max - value.length
    const toAdd: SnippetFile[] = Array.from(files)
      .slice(0, remaining)
      .map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
        size: f.size,
        mimeType: f.type || "application/octet-stream",
      }))
    onChange([...value, ...toAdd])
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <input
        accept="*"
        className="hidden"
        multiple
        onChange={(e) => handlePick(e.target.files)}
        ref={inputRef}
        type="file"
      />
      <Button
        className="w-full"
        disabled={reachedLimit}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon className="size-4" />
        {reachedLimit ? t("snippets.filesLimitReached") : t("snippets.addFile")}
      </Button>
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((file) => (
            <li
              className="flex items-center gap-2 rounded border border-white/[0.08] bg-app-surface px-2 py-1.5 text-sm"
              key={file.url}
            >
              <span className="min-w-0 flex-1 truncate" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 text-text-tertiary text-xs">
                {formatBytes(file.size)}
              </span>
              <button
                aria-label={t("actions.remove")}
                className="rounded p-0.5 text-text-tertiary hover:bg-white/[0.08] hover:text-foreground"
                onClick={() =>
                  onChange(value.filter((f) => f.url !== file.url))
                }
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
