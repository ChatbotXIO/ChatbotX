"use client"

import { rootFolderId } from "@chatbotx.io/database/partials"
import type { TagModel } from "@chatbotx.io/database/types"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useCurrentTheme } from "@/hooks/use-current-theme"
import { createTagAction } from "./actions/create-tag-action"
import { updateTagAction } from "./actions/update-tag-action"
import {
  createTagRequest,
  type UpdateTagSchema,
  updateTagSchema,
} from "./schema/action"
import {
  DEFAULT_TAG_COLOR,
  getSwatchStyle,
  getTagChipStyle,
  TAG_PRESET_COLORS,
} from "./tag-colors"

// Carrega o picker dinamicamente — evita SSR (lib é pesada e só faz sentido client-side).
const BaseEmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => <Skeleton className="size-72 rounded-xl" />,
})

// Valores do enum Theme da lib — copiados aqui pra evitar puxar o enum
// (que carrega a lib inteira). Type-cast no uso é seguro porque a lib
// aceita exatamente essas strings em runtime.
const PICKER_THEME = { DARK: "dark", LIGHT: "light", AUTO: "auto" } as const

type TagFormDialogProps = {
  workspaceId: string
  // Quando `tag` está presente o dialog opera em modo edit; senão é create.
  tag?: TagModel | null
  // No modo create o componente é controlado pelo botão "Criar Etiqueta" interno.
  // No modo edit quem renderiza controla via open/onOpenChange.
  open?: boolean
  onOpenChange?: (val: boolean) => void
  folderId?: string | null
}

export function TagFormDialog({
  workspaceId,
  tag,
  open: controlledOpen,
  onOpenChange,
  folderId,
}: TagFormDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  // Tema atual pra repassar pro emoji-picker-react (sem isso ele renderiza
  // sempre em light, virou um quadrado branco horrível no app em dark mode).
  // Cast pra `Theme` da lib — runtime aceita exatamente essas strings.
  const currentTheme = useCurrentTheme()
  const pickerTheme = (
    currentTheme === "dark" ? PICKER_THEME.DARK : PICKER_THEME.LIGHT
  ) as never
  const isEdit = !!tag
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  // Quando o componente é controlado externamente (recebe `open`/`onOpenChange`),
  // NÃO renderizamos o DialogTrigger interno — quem usa controla a abertura.
  // Senão renderizamos só no modo create (botão "Criar Etiqueta" no toolbar).
  // Sem essa checagem, o TagFormDialog em modo "update controlado" aparecia
  // como uma barra azul gigante no meio da tela (bug visto pelo Pedro).
  const isControlled = controlledOpen !== undefined
  const showTrigger = !(isControlled || isEdit)

  const createForm = useHookFormAction(
    createTagAction.bind(null, workspaceId),
    zodResolver(createTagRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", { feature: t("fields.tag.label") }),
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
          color: DEFAULT_TAG_COLOR,
          emoji: "",
          description: "",
          folderId: null,
          syncToMessenger: false,
        },
      },
      errorMapProps: {},
    },
  )

  const updateForm = useHookFormAction(
    updateTagAction.bind(null, workspaceId, tag?.id ?? ""),
    zodResolver(updateTagSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", { feature: t("fields.tag.label") }),
          )
          setOpen(false)
          updateForm.resetFormAndAction()
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
      },
      errorMapProps: {},
    },
  )

  const { form, handleSubmitWithAction, resetFormAndAction } = isEdit
    ? updateForm
    : createForm

  // Quando o usuário abre o create dentro de uma pasta específica, herda.
  useEffect(() => {
    if (!isEdit && folderId && folderId !== rootFolderId) {
      createForm.form.setValue("folderId", folderId)
    }
  }, [folderId, isEdit, createForm.form])

  // Pré-popula o form de edit ao trocar de tag.
  useEffect(() => {
    if (isEdit && tag) {
      updateForm.form.reset({
        name: tag.name,
        color: tag.color ?? DEFAULT_TAG_COLOR,
        emoji: tag.emoji ?? "",
        description: tag.description ?? "",
      } satisfies UpdateTagSchema)
    }
  }, [isEdit, tag, updateForm.form])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) {
        resetFormAndAction()
      }
    },
    [setOpen, resetFormAndAction],
  )

  // Watch pra atualizar a preview chip ao vivo conforme o usuário muda.
  // Usamos useWatch (vs form.watch) pra evitar problema de inferência de tipo
  // — `form` aqui é união de 2 schemas (create vs update) e o overload de
  // form.watch fica ambíguo. useWatch com `control` resolve cleanly.
  const watched = useWatch({ control: form.control }) as {
    color?: string
    emoji?: string | null
    name?: string
  }
  const watchedColor = watched.color ?? DEFAULT_TAG_COLOR
  const watchedEmoji = watched.emoji ?? ""
  const watchedName = watched.name ?? ""

  const previewLabel = useMemo(
    () => watchedName.trim() || t("fields.tag.label"),
    [watchedName, t],
  )

  const title = isEdit
    ? t("messages.editFeature", { feature: t("fields.tag.label") })
    : t("messages.createFeature", { feature: t("fields.tag.label") })

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button size="sm">
            <PlusIcon />
            {t("messages.createFeature", { feature: t("fields.tag.label") })}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("tags.formDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-5" onSubmit={handleSubmitWithAction}>
            {/* Linha 1 — Emoji (popover) + Nome (input) */}
            <div className="flex items-end gap-2">
              <FormField
                control={form.control}
                name="emoji"
                render={({ field }) => (
                  <FormItem className="shrink-0">
                    <FormLabel>{t("tags.emojiLabel")}</FormLabel>
                    <FormControl>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            className="h-9 w-12 text-lg"
                            type="button"
                            variant="outline"
                          >
                            {field.value || "🙂"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-auto border-0 p-0"
                        >
                          <BaseEmojiPicker
                            autoFocusSearch={false}
                            emojiVersion="0.6"
                            height={360}
                            lazyLoadEmojis
                            onEmojiClick={(v) => {
                              field.onChange(v.emoji)
                            }}
                            // Override das CSS vars internas do emoji-picker-react
                            // pra ter 9 emojis por linha (default da lib são 30px
                            // size + 5px padding = 40px fullsize → 7 por linha
                            // num picker de 300px). Pedro pediu 9 igual Respond.io.
                            // 24px size + 4px padding = 32px fullsize → 9 por linha
                            // com folga no picker de 320px. A lib aplica essas
                            // vars no elemento `.epr-main` via Stylesheet interno,
                            // então precisa passar via `style` direto no Picker
                            // (não funciona via parent — perde pra especificidade).
                            style={
                              {
                                "--epr-emoji-size": "24px",
                                "--epr-emoji-padding": "4px",
                              } as React.CSSProperties
                            }
                            // Theme acompanha o app — sem isso a lib renderiza
                            // sempre em light (quadrado branco no dark mode).
                            theme={pickerTheme}
                            width={320}
                          />
                          {field.value ? (
                            <div className="border-t p-2">
                              <Button
                                className="w-full"
                                onClick={() => field.onChange("")}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {t("tags.clearEmoji")}
                              </Button>
                            </div>
                          ) : null}
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>{t("fields.name.label")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("tags.namePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Linha 2 — Paleta de cores estilo Respond.io (8 swatches) */}
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("tags.colorLabel")}</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {TAG_PRESET_COLORS.map((c) => {
                        const isSelected = field.value === c
                        const swatch = getSwatchStyle(c)
                        return (
                          <button
                            aria-label={`Cor ${c}`}
                            className={cn(
                              "flex size-8 items-center justify-center rounded-full border-2 transition-all",
                              isSelected ? "scale-110" : "hover:scale-105",
                            )}
                            key={c}
                            onClick={() => field.onChange(c)}
                            // Swatch fica em estilo pastel pra distinguir cores;
                            // quando selecionado, borda vira a cor cheia + check
                            // tb na cor cheia (visível sobre o pastel).
                            style={{
                              backgroundColor: swatch.backgroundColor,
                              borderColor: isSelected ? c : swatch.borderColor,
                            }}
                            type="button"
                          >
                            {isSelected ? (
                              <CheckIcon
                                className="size-4"
                                style={{ color: c }}
                              />
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Linha 3 — Descrição opcional */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("tags.descriptionLabel")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("tags.descriptionPlaceholder")}
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Preview ao vivo do chip — ajuda usuário visualizar antes de salvar.
                Estilo translúcido: bg com alpha + texto na cor saturada (igual Respond.io). */}
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-2 text-muted-foreground text-xs">
                {t("tags.preview")}
              </div>
              <span
                // Chip estilo Respond.io adaptado (Pedro 2026-05-26):
                // radius 4px (quadriculado com pontinhas), padding 4×8,
                // font 12px/16px weight 600, outline 1px sutil.
                className="inline-flex items-center gap-1 rounded px-2 py-1 font-semibold text-xs leading-4"
                style={getTagChipStyle(watchedColor)}
              >
                {watchedEmoji ? <span>{watchedEmoji}</span> : null}
                {previewLabel}
              </span>
            </div>

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
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
