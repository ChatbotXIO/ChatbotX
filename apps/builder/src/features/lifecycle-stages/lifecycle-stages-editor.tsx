"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  BookOpenIcon,
  GripVerticalIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { saveLifecycleStagesAction } from "./actions/save-lifecycle-stages-action"
import { DeleteStageDialog } from "./delete-stage-dialog"

const LIFECYCLE_VISIBILITY_KEY = "chatbotx.lifecycle.visible"

const EmojiPickerReact = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-[320px] rounded-md" />,
})

export type LifecycleStageData = {
  id: string
  key: string
  name: string
  icon: string | null
  color: string | null
  position: number
  isDefault: boolean
  isLost: boolean
}

type EditableStage = LifecycleStageData & {
  _new?: boolean
  _dirty?: boolean
  _deleted?: boolean
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "etapa"

function generateLocalId(): string {
  return `__new_${Math.random().toString(36).slice(2, 11)}`
}

export function LifecycleStagesEditor({
  initialStages,
}: {
  initialStages: LifecycleStageData[]
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [serverStages, setServerStages] =
    useState<LifecycleStageData[]>(initialStages)
  const [editedStages, setEditedStages] = useState<EditableStage[]>(
    initialStages.map((s) => ({ ...s })),
  )
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [deleteStageId, setDeleteStageId] = useState<string | null>(null)

  // Toggle global persiste em localStorage
  const [showLifecycle, setShowLifecycle] = useState(true)
  useEffect(() => {
    const stored = localStorage.getItem(LIFECYCLE_VISIBILITY_KEY)
    if (stored !== null) {
      setShowLifecycle(stored === "true")
    }
  }, [])
  const onToggleVisibility = (next: boolean) => {
    setShowLifecycle(next)
    localStorage.setItem(LIFECYCLE_VISIBILITY_KEY, next ? "true" : "false")
  }

  const hasChanges = useMemo(() => {
    if (editedStages.length !== serverStages.length) {
      return true
    }
    for (const e of editedStages) {
      const s = serverStages.find((x) => x.id === e.id)
      if (e._new || e._dirty || e._deleted) {
        return true
      }
      if (!s) {
        return true
      }
      if (
        e.name !== s.name ||
        e.icon !== s.icon ||
        e.position !== s.position ||
        e.isDefault !== s.isDefault ||
        e.isLost !== s.isLost
      ) {
        return true
      }
    }
    return false
  }, [editedStages, serverStages])

  const active = editedStages.filter((s) => !(s.isLost || s._deleted))
  const lost = editedStages.filter((s) => s.isLost && !s._deleted)

  const { execute: save, isExecuting: saving } = useAction(
    saveLifecycleStagesAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("lifecycle.saved"))
        // Limpa as flags _new/_dirty/_deleted e atualiza serverStages
        const _cleanStages = editedStages
          .filter((s) => !s._deleted)
          .map((s) => {
            const clean: LifecycleStageData = {
              id: s._new ? s.id : s.id, // backend gerou ID novo pra _new — mas como ainda não retornamos, vamos forçar reload
              key: s.key,
              name: s.name,
              icon: s.icon,
              color: s.color,
              position: s.position,
              isDefault: s.isDefault,
              isLost: s.isLost,
            }
            return clean
          })
        // Reload pra pegar IDs corretos dos novos
        window.location.reload()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        } else {
          toast.error(t("lifecycle.saveError"))
        }
      },
    },
  )

  // --- Operações locais ---
  function updateStage(id: string, patch: Partial<EditableStage>) {
    setEditedStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch, _dirty: true } : s)),
    )
  }

  function deleteStage(id: string) {
    const target = editedStages.find((s) => s.id === id)
    if (!target) {
      return
    }
    setMenuOpenFor(null)

    // Se a etapa é nova (ainda não salvou no banco), apaga local sem modal
    if (target._new) {
      setEditedStages((prev) => prev.filter((s) => s.id !== id))
      return
    }

    // Abre modal de reassignment pra etapa persistida
    setDeleteStageId(id)
  }

  function handleStageDeleted(stageId: string) {
    // Remove da lista local após delete bem-sucedido no servidor
    setEditedStages((prev) => prev.filter((s) => s.id !== stageId))
    setServerStages((prev) => prev.filter((s) => s.id !== stageId))
  }

  function setAsDefault(id: string) {
    setEditedStages((prev) =>
      prev.map((s) => {
        if (s.isLost) {
          return s
        }
        const shouldBeDefault = s.id === id
        if (s.isDefault === shouldBeDefault) {
          return s
        }
        return { ...s, isDefault: shouldBeDefault, _dirty: true }
      }),
    )
    setMenuOpenFor(null)
  }

  function addStage(type: "active" | "lost") {
    const isLost = type === "lost"
    const sameTypeStages = editedStages.filter(
      (s) => s.isLost === isLost && !s._deleted,
    )
    const newPosition =
      (sameTypeStages.length > 0
        ? Math.max(...sameTypeStages.map((s) => s.position))
        : 0) + 1
    const id = generateLocalId()
    const newStage: EditableStage = {
      id,
      key: slugify(`nova_etapa_${id.slice(-6)}`),
      name: t("lifecycle.newStage"),
      icon: isLost ? "❌" : "📥",
      color: isLost ? "#ef4444" : "#3b82f6",
      position: newPosition,
      isDefault: false,
      isLost,
      _new: true,
      _dirty: true,
    }
    setEditedStages((prev) => [...prev, newStage])
  }

  function handleCancel() {
    setEditedStages(serverStages.map((s) => ({ ...s })))
    setMenuOpenFor(null)
  }

  function handleSave() {
    // Validar nomes vazios
    const invalid = editedStages.find((s) => !(s._deleted || s.name.trim()))
    if (invalid) {
      toast.error(t("lifecycle.emptyNameError"))
      return
    }

    // Regenera key dos novos baseado no nome
    const payload = editedStages.map((s) => ({
      ...s,
      key: s._new ? slugify(s.name) : s.key,
    }))

    save({ stages: payload })
  }

  // --- Drag & Drop ---
  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
  }

  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (id !== draggingId) {
      setDragOverId(id)
    }
    e.dataTransfer.dropEffect = "move"
  }

  function onDragLeave() {
    setDragOverId(null)
  }

  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    const sourceId = draggingId || e.dataTransfer.getData("text/plain")
    setDraggingId(null)
    setDragOverId(null)
    if (!sourceId || sourceId === targetId) {
      return
    }

    const source = editedStages.find((s) => s.id === sourceId)
    const target = editedStages.find((s) => s.id === targetId)
    if (!(source && target)) {
      return
    }

    // Cross-column drag bloqueado
    if (source.isLost !== target.isLost) {
      return
    }

    setEditedStages((prev) => {
      const sameColumn = prev.filter(
        (s) => s.isLost === source.isLost && !s._deleted,
      )
      const others = prev.filter(
        (s) => s.isLost !== source.isLost || s._deleted,
      )
      const sIdx = sameColumn.findIndex((s) => s.id === sourceId)
      const tIdx = sameColumn.findIndex((s) => s.id === targetId)
      const reordered = [...sameColumn]
      const [moved] = reordered.splice(sIdx, 1)
      reordered.splice(tIdx, 0, moved)

      const renumbered = reordered.map((s, i) => ({
        ...s,
        position: i + 1,
        _dirty: true,
      }))
      return [...others, ...renumbered]
    })
  }

  function onDragEnd() {
    setDraggingId(null)
    setDragOverId(null)
  }

  // ---
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-semibold text-base">{t("lifecycle.title")}</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("lifecycle.subtitle")}
          </p>
        </div>
        <a
          className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
          href="https://respond.io/help/workspace-settings/workspace-settings-lifecycle"
          rel="noreferrer"
          target="_blank"
        >
          <BookOpenIcon className="size-4" />
          {t("lifecycle.learnMore")}
        </a>
      </div>

      {/* Toggle global Mostrar/Ocultar */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-sm">
            {t("lifecycle.toggleTitle")}
          </span>
          <span className="text-muted-foreground text-xs">
            {t("lifecycle.toggleSubtitle")}
          </span>
        </div>
        <Switch checked={showLifecycle} onCheckedChange={onToggleVisibility} />
      </div>

      {/* Sub-header com Cancelar/Guardar */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          {t("lifecycle.configureTitle")}
        </h3>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <Button
              disabled={saving}
              onClick={handleCancel}
              size="sm"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} onClick={handleSave} size="sm">
              {saving && <Loader2Icon className="size-3.5 animate-spin" />}
              {saving ? t("lifecycle.saving") : t("actions.save")}
            </Button>
          </div>
        )}
      </div>

      {/* 2 colunas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Column
          draggingId={draggingId}
          dragOverId={dragOverId}
          emojiPickerFor={emojiPickerFor}
          icon="🏆"
          isLost={false}
          menuOpenFor={menuOpenFor}
          onAdd={() => addStage("active")}
          onDelete={deleteStage}
          onDragEnd={onDragEnd}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onSetDefault={setAsDefault}
          onUpdate={updateStage}
          setEmojiPickerFor={setEmojiPickerFor}
          setMenuOpenFor={setMenuOpenFor}
          stages={active}
          subtitle={t("lifecycle.activeSubtitle")}
          title={t("lifecycle.activeTitle")}
        />
        <Column
          draggingId={draggingId}
          dragOverId={dragOverId}
          emojiPickerFor={emojiPickerFor}
          icon="😞"
          isLost={true}
          menuOpenFor={menuOpenFor}
          onAdd={() => addStage("lost")}
          onDelete={deleteStage}
          onDragEnd={onDragEnd}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onSetDefault={setAsDefault}
          onUpdate={updateStage}
          setEmojiPickerFor={setEmojiPickerFor}
          setMenuOpenFor={setMenuOpenFor}
          stages={lost}
          subtitle={t("lifecycle.lostSubtitle")}
          title={t("lifecycle.lostTitle")}
        />
      </div>

      <DeleteStageDialog
        allStages={editedStages.map((s) => ({
          id: s.id,
          name: s.name,
          icon: s.icon,
          isLost: s.isLost,
        }))}
        onDeleted={() => {
          if (deleteStageId) {
            handleStageDeleted(deleteStageId)
          }
          setDeleteStageId(null)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteStageId(null)
          }
        }}
        open={deleteStageId !== null}
        stage={
          deleteStageId
            ? (() => {
                const s = editedStages.find((e) => e.id === deleteStageId)
                return s
                  ? {
                      id: s.id,
                      name: s.name,
                      icon: s.icon,
                      isLost: s.isLost,
                    }
                  : null
              })()
            : null
        }
      />
    </div>
  )
}

type ColumnProps = {
  title: string
  subtitle: string
  icon: string
  isLost: boolean
  stages: EditableStage[]
  draggingId: string | null
  dragOverId: string | null
  menuOpenFor: string | null
  setMenuOpenFor: (id: string | null) => void
  emojiPickerFor: string | null
  setEmojiPickerFor: (id: string | null) => void
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<EditableStage>) => void
  onDelete: (id: string) => void
  onSetDefault: (id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
}

function Column({
  title,
  subtitle,
  icon,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: parte do contrato do componente — caller passa pra distinguir coluna lost/active
  isLost,
  stages,
  draggingId,
  dragOverId,
  menuOpenFor,
  setMenuOpenFor,
  emojiPickerFor,
  setEmojiPickerFor,
  onAdd,
  onUpdate,
  onDelete,
  onSetDefault,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: ColumnProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-sm">
          <span>{icon}</span>
          <span>{title}</span>
        </h2>
        <p className="mt-1 text-muted-foreground text-xs">{subtitle}</p>
      </div>

      <div className="flex flex-col gap-2">
        {stages.map((stage, idx) => (
          <div className="flex flex-col gap-1" key={stage.id}>
            <span className="px-7 text-muted-foreground text-xs">
              {t("lifecycle.stageNumber", { n: idx + 1 })}
            </span>
            {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: drag-and-drop pattern HTML5 nativo via draggable + onDragStart/Over/End */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: idem */}
            <div
              className={cn(
                "group flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 transition-all",
                draggingId === stage.id && "opacity-40",
                dragOverId === stage.id && "scale-[1.01] border-primary",
              )}
              draggable
              onDragEnd={onDragEnd}
              onDragLeave={onDragLeave}
              onDragOver={(e) => onDragOver(e, stage.id)}
              onDragStart={(e) => onDragStart(e, stage.id)}
              onDrop={(e) => onDrop(e, stage.id)}
            >
              <GripVerticalIcon className="size-4 shrink-0 cursor-grab text-muted-foreground" />
              <Popover
                onOpenChange={(open) =>
                  setEmojiPickerFor(open ? stage.id : null)
                }
                open={emojiPickerFor === stage.id}
              >
                <PopoverTrigger asChild>
                  <button
                    aria-label="Emoji"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-lg hover:bg-accent"
                    type="button"
                  >
                    {stage.icon ?? "📌"}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-auto border-0 p-0"
                  side="bottom"
                >
                  <EmojiPickerReact
                    autoFocusSearch
                    categories={[
                      {
                        category: "suggested" as never,
                        name: t("lifecycle.emojiCategories.suggested"),
                      },
                      {
                        category: "smileys_people" as never,
                        name: t("lifecycle.emojiCategories.smileys"),
                      },
                      {
                        category: "animals_nature" as never,
                        name: t("lifecycle.emojiCategories.animals"),
                      },
                      {
                        category: "food_drink" as never,
                        name: t("lifecycle.emojiCategories.food"),
                      },
                      {
                        category: "travel_places" as never,
                        name: t("lifecycle.emojiCategories.travel"),
                      },
                      {
                        category: "activities" as never,
                        name: t("lifecycle.emojiCategories.activities"),
                      },
                      {
                        category: "objects" as never,
                        name: t("lifecycle.emojiCategories.objects"),
                      },
                      {
                        category: "symbols" as never,
                        name: t("lifecycle.emojiCategories.symbols"),
                      },
                      {
                        category: "flags" as never,
                        name: t("lifecycle.emojiCategories.flags"),
                      },
                    ]}
                    height={380}
                    lazyLoadEmojis
                    onEmojiClick={(emojiData) => {
                      onUpdate(stage.id, { icon: emojiData.emoji })
                      setEmojiPickerFor(null)
                    }}
                    previewConfig={{ showPreview: false }}
                    searchPlaceHolder={t("lifecycle.emojiSearch")}
                    theme={"auto" as never}
                    width={320}
                  />
                </PopoverContent>
              </Popover>
              <Input
                aria-label={t("lifecycle.stageName")}
                className="h-8 flex-1"
                onChange={(e) => onUpdate(stage.id, { name: e.target.value })}
                value={stage.name}
              />
              {stage.isDefault && !stage.isLost && (
                <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 font-semibold text-primary text-xs uppercase">
                  {t("lifecycle.defaultBadge")}
                </span>
              )}
              <div className="relative">
                <Button
                  className="size-8 p-0 opacity-0 group-hover:opacity-100"
                  onClick={() =>
                    setMenuOpenFor(menuOpenFor === stage.id ? null : stage.id)
                  }
                  size="sm"
                  variant="ghost"
                >
                  <MoreHorizontalIcon className="size-4" />
                </Button>
                {menuOpenFor === stage.id && (
                  <>
                    {/* biome-ignore lint/a11y/useSemanticElements: backdrop overlay click-outside; <button> teria estilo inválido pro fullscreen invisible div */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpenFor(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setMenuOpenFor(null)
                        }
                      }}
                      role="button"
                      tabIndex={-1}
                    />
                    <div className="absolute right-0 z-20 mt-1 min-w-36 rounded-md border bg-popover p-1 shadow-md">
                      {!(stage.isLost || stage.isDefault) && (
                        <button
                          className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                          onClick={() => onSetDefault(stage.id)}
                          type="button"
                        >
                          {t("lifecycle.menu.setAsDefault")}
                        </button>
                      )}
                      <button
                        className="w-full rounded px-2 py-1.5 text-left text-destructive text-sm hover:bg-destructive/10"
                        onClick={() => onDelete(stage.id)}
                        type="button"
                      >
                        {t("lifecycle.menu.delete")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        <button
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-border border-dashed px-3 py-2 text-primary text-sm hover:bg-primary/5"
          onClick={onAdd}
          type="button"
        >
          <PlusIcon className="size-4" />
          {t("lifecycle.addStage")}
        </button>
      </div>
    </div>
  )
}
