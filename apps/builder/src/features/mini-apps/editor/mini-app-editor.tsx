"use client"

import {
  canPlaceInSlot,
  getSlotOwnerType,
  isDescendantOf,
  type MiniAppComponentType,
  type MiniAppDefaultText,
  type MiniAppDefinition,
  type MiniAppValidationIssue,
  toFlowJson,
  validateMiniApp,
} from "@chatbotx.io/mini-app"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  AlertTriangleIcon,
  BracesIcon,
  CheckCircle2Icon,
  EyeIcon,
  Loader2Icon,
  PlusIcon,
  Redo2Icon,
  SaveIcon,
  SendIcon,
  Undo2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { PublicUrlSection } from "@/components/public-url-section"
import { createMiniAppAction } from "../actions/create-mini-app.action"
import { updateMiniAppAction } from "../actions/update-mini-app.action"
import { FlowJsonDialog } from "../components/flow-json-dialog"
import { PublishWhatsappDialog } from "../components/publish-whatsapp-dialog"
import { componentLabelKey, defaultTextKey } from "../lib/labels"
import { useIssueMessage } from "../lib/use-issue-message"
import type { WhatsappPublishTarget } from "../queries"
import { MiniAppRunner } from "../runner/mini-app-runner"
import { CanvasContext, ScreenCanvas } from "./canvas"
import {
  type DragSource,
  type DropTarget,
  type DropZone,
  innermostCollision,
  resolveDropTarget,
} from "./dnd"
import { MiniAppEditorProvider, useMiniAppEditor } from "./editor-context"
import { NodeInspector } from "./inspector/node-inspector"
import { ScreenInspector } from "./inspector/screen-inspector"
import { componentIcon, Palette } from "./palette"

export type MiniAppEditorProps = {
  workspaceId: string
  miniAppId?: string
  /** The shareable link, shown once the Mini App exists (edit page only). */
  publicUrl?: string
  initialName: string
  initialDefinition: MiniAppDefinition
  publishTargets: WhatsappPublishTarget[]
}

function useDefaultText(): MiniAppDefaultText {
  const t = useTranslations()
  return useCallback((key) => t(defaultTextKey[key]), [t])
}

function IssuesButton({ issues }: { issues: MiniAppValidationIssue[] }) {
  const t = useTranslations("miniApps.editor")
  const message = useIssueMessage()
  const definition = useMiniAppEditor((state) => state.definition)
  const selectScreen = useMiniAppEditor((state) => state.selectScreen)
  const selectNode = useMiniAppEditor((state) => state.selectNode)
  const errors = issues.filter((issue) => issue.severity === "error").length

  if (issues.length === 0) {
    return (
      <Badge className="gap-1" variant="outline">
        <CheckCircle2Icon className="size-3.5 text-green-600" />
        {t("noIssues")}
      </Badge>
    )
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline">
            <AlertTriangleIcon
              className={cn(
                "size-4",
                errors > 0 ? "text-destructive" : "text-amber-500",
              )}
            />
            {t("issuesCount", { count: issues.length })}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96 p-0">
        <ScrollArea className="max-h-80">
          <div className="flex flex-col divide-y">
            {issues.map((issue, index) => {
              const screen = definition.screens.find(
                (candidate) => candidate.key === issue.screenKey,
              )
              return (
                <button
                  className="flex flex-col gap-0.5 px-3 py-2 text-start hover:bg-muted"
                  // biome-ignore lint/suspicious/noArrayIndexKey: issues have no id
                  key={index}
                  onClick={() => {
                    if (issue.screenKey) {
                      selectScreen(issue.screenKey)
                    }
                    if (issue.nodeId) {
                      selectNode(issue.nodeId)
                    }
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      "text-sm",
                      issue.severity === "error"
                        ? "text-destructive"
                        : "text-amber-600",
                    )}
                  >
                    {message(issue)}
                  </span>
                  {screen ? (
                    <span className="text-muted-foreground text-xs">
                      {screen.title || screen.id}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function ScreensBar() {
  const t = useTranslations("miniApps.editor")
  const screens = useMiniAppEditor((state) => state.definition.screens)
  const selectedScreenKey = useMiniAppEditor((state) => state.selectedScreenKey)
  const selectScreen = useMiniAppEditor((state) => state.selectScreen)
  const addScreen = useMiniAppEditor((state) => state.addScreen)
  const moveScreen = useMiniAppEditor((state) => state.moveScreen)
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b px-3 py-2">
      {screens.map((screen, index) => (
        <button
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm",
            screen.key === selectedScreenKey
              ? "border-primary bg-primary/10 text-primary"
              : "hover:bg-muted",
          )}
          draggable
          key={screen.key}
          onClick={() => selectScreen(screen.key)}
          onDragOver={(event) => event.preventDefault()}
          onDragStart={(event) =>
            event.dataTransfer.setData("text/plain", String(index))
          }
          onDrop={(event) => {
            const from = Number(event.dataTransfer.getData("text/plain"))
            if (!Number.isNaN(from) && from !== index) {
              moveScreen(from, index)
            }
          }}
          type="button"
        >
          <span className="text-muted-foreground text-xs">{index + 1}</span>
          {screen.title || screen.id}
          {screen.terminal ? (
            <CheckCircle2Icon className="size-3.5 text-green-600" />
          ) : null}
        </button>
      ))}
      <Button
        onClick={() => addScreen(t("newScreenTitle"))}
        size="sm"
        variant="ghost"
      >
        <PlusIcon className="size-4" />
        {t("addScreen")}
      </Button>
    </div>
  )
}

function EditorBody({
  workspaceId,
  miniAppId,
  publicUrl,
  publishTargets,
}: Omit<MiniAppEditorProps, "initialName" | "initialDefinition">) {
  const t = useTranslations()
  const router = useRouter()
  const defaultText = useDefaultText()
  const name = useMiniAppEditor((state) => state.name)
  const setName = useMiniAppEditor((state) => state.setName)
  const definition = useMiniAppEditor((state) => state.definition)
  const selectedNodeId = useMiniAppEditor((state) => state.selectedNodeId)
  const dirty = useMiniAppEditor((state) => state.dirty)
  const canUndo = useMiniAppEditor((state) => state.past.length > 0)
  const canRedo = useMiniAppEditor((state) => state.future.length > 0)
  const undo = useMiniAppEditor((state) => state.undo)
  const redo = useMiniAppEditor((state) => state.redo)
  const addNode = useMiniAppEditor((state) => state.addNode)
  const moveNode = useMiniAppEditor((state) => state.moveNode)
  const removeNode = useMiniAppEditor((state) => state.removeNode)
  const selectNode = useMiniAppEditor((state) => state.selectNode)
  const markSaved = useMiniAppEditor((state) => state.markSaved)

  const [dragSource, setDragSource] = useState<DragSource | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [nameError, setNameError] = useState<string | undefined>()

  const validation = useMemo(() => validateMiniApp(definition), [definition])
  const nodesWithErrors = useMemo(
    () =>
      new Set(
        validation.issues
          .filter((issue) => issue.nodeId && issue.severity === "error")
          .map((issue) => issue.nodeId as string),
      ),
    [validation],
  )
  const flowJson = useMemo(
    () => (jsonOpen ? toFlowJson(definition) : null),
    [jsonOpen, definition],
  )

  const onSaved = () => {
    markSaved()
    setNameError(undefined)
    toast.success(t("messages.savedSuccessfully"))
  }
  const onSaveError = ({
    error,
  }: {
    error: {
      serverError?: string
      validationErrors?: { name?: { _errors?: string[] } }
    }
  }) => {
    const nameMessage = error.validationErrors?.name?._errors?.[0]
    setNameError(nameMessage)
    toast.error(
      nameMessage ?? error.serverError ?? t("miniApps.editor.saveFailed"),
    )
  }
  const create = useAction(createMiniAppAction.bind(null, workspaceId), {
    onSuccess: ({ data }) => {
      onSaved()
      if (data?.id) {
        router.push(`/space/${workspaceId}/mini-apps/${data.id}/edit`)
      }
    },
    onError: onSaveError,
  })
  const update = useAction(
    updateMiniAppAction.bind(null, workspaceId, miniAppId ?? ""),
    {
      onSuccess: () => {
        onSaved()
        router.refresh()
      },
      onError: onSaveError,
    },
  )
  const isSaving = create.isPending || update.isPending
  const save = useCallback(() => {
    const input = { name: name.trim(), definition }
    if (miniAppId) {
      update.execute(input)
    } else {
      create.execute(input)
    }
  }, [name, definition, miniAppId, update, create])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.closest(
        "input, textarea, [contenteditable=true], .cm-editor",
      )
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault()
        save()
        return
      }
      if (typing) {
        return
      }
      if (event.key === "Escape") {
        selectNode(null)
        return
      }
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedNodeId
      ) {
        event.preventDefault()
        removeNode(selectedNodeId)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [save, undo, redo, removeNode, selectNode, selectedNodeId])

  useEffect(() => {
    if (!dirty) {
      return
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const pointerY = (event: DragMoveEvent | DragEndEvent) => {
    const activator = event.activatorEvent as PointerEvent | MouseEvent
    return ("clientY" in activator ? activator.clientY : 0) + event.delta.y
  }

  const computeTarget = (
    event: DragMoveEvent | DragEndEvent,
  ): DropTarget | null => {
    const source = event.active.data.current as DragSource | undefined
    const zone = event.over?.data.current as DropZone | undefined
    if (!(source && zone && event.over)) {
      return null
    }
    const target = resolveDropTarget(zone, event.over.rect, pointerY(event))
    const owner = getSlotOwnerType(definition, target.address)
    if (!(owner && canPlaceInSlot(owner, source.type))) {
      return null
    }
    if (
      source.kind === "node" &&
      target.address.parentId &&
      (target.address.parentId === source.nodeId ||
        isDescendantOf(definition, source.nodeId, target.address.parentId))
    ) {
      return null
    }
    return target
  }

  const onDragEnd = (event: DragEndEvent) => {
    const source = event.active.data.current as DragSource | undefined
    const target = computeTarget(event)
    setDragSource(null)
    setDropTarget(null)
    if (!(source && target)) {
      if (source && event.over) {
        toast.error(t("miniApps.editor.cannotDropHere"))
      }
      return
    }
    if (source.kind === "palette") {
      addNode(source.type, defaultText, {
        address: target.address,
        index: target.index,
      })
    } else {
      moveNode(source.nodeId, target.address, target.index)
    }
  }

  const DragIcon = dragSource ? componentIcon[dragSource.type] : null

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex min-w-60 flex-col">
          <Input
            aria-invalid={nameError ? true : undefined}
            aria-label={t("fields.name.label")}
            className="h-8 font-semibold"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("miniApps.editor.namePlaceholder")}
            value={name}
          />
          {nameError ? (
            <span className="text-destructive text-xs">{nameError}</span>
          ) : null}
        </div>
        <div className="flex items-center">
          <Button
            aria-label={t("miniApps.editor.undo")}
            disabled={!canUndo}
            onClick={undo}
            size="icon"
            variant="ghost"
          >
            <Undo2Icon className="size-4" />
          </Button>
          <Button
            aria-label={t("miniApps.editor.redo")}
            disabled={!canRedo}
            onClick={redo}
            size="icon"
            variant="ghost"
          >
            <Redo2Icon className="size-4" />
          </Button>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <IssuesButton issues={validation.issues} />
          <Button
            onClick={() => setPreviewOpen(true)}
            size="sm"
            variant="outline"
          >
            <EyeIcon className="size-4" />
            {t("miniApps.editor.preview")}
          </Button>
          <Button onClick={() => setJsonOpen(true)} size="sm" variant="outline">
            <BracesIcon className="size-4" />
            {t("miniApps.editor.viewJson")}
          </Button>
          <Button disabled={isSaving || !name.trim()} onClick={save} size="sm">
            {isSaving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </div>
      <ScreensBar />
      <DndContext
        collisionDetection={innermostCollision}
        onDragCancel={() => {
          setDragSource(null)
          setDropTarget(null)
        }}
        onDragEnd={onDragEnd}
        onDragMove={(event) => setDropTarget(computeTarget(event))}
        onDragStart={(event: DragStartEvent) =>
          setDragSource((event.active.data.current as DragSource) ?? null)
        }
        sensors={sensors}
      >
        <CanvasContext.Provider
          value={{
            dropTarget,
            draggingNodeId:
              dragSource?.kind === "node" ? dragSource.nodeId : null,
            nodesWithErrors,
          }}
        >
          <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_340px]">
            <div className="min-h-0 border-e">
              <Palette
                onAdd={(type: MiniAppComponentType) =>
                  addNode(type, defaultText)
                }
              />
            </div>
            <div className="min-h-0">
              <ScreenCanvas />
            </div>
            <ScrollArea className="min-h-0 border-s">
              <div className="p-4">
                {selectedNodeId ? (
                  <NodeInspector
                    issues={validation.issues}
                    nodeId={selectedNodeId}
                  />
                ) : (
                  <ScreenInspector issues={validation.issues} />
                )}
              </div>
            </ScrollArea>
          </div>
        </CanvasContext.Provider>
        {miniAppId ? (
          <div className="flex items-center gap-3 border-t px-3 py-2">
            <div className="min-w-0 flex-1">
              {publicUrl ? (
                <PublicUrlSection
                  hint={t("miniApps.publicUrl.hint")}
                  label={t("miniApps.publicUrl.label")}
                  publicUrl={publicUrl}
                />
              ) : null}
            </div>
            <Button
              className="flex-none"
              onClick={() => setPublishOpen(true)}
              size="sm"
              variant="outline"
            >
              <SendIcon className="size-4" />
              {t("miniApps.publish.open")}
            </Button>
          </div>
        ) : null}
        <DragOverlay dropAnimation={null}>
          {dragSource && DragIcon ? (
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm shadow-lg">
              <DragIcon className="size-4" />
              {t(componentLabelKey[dragSource.type])}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <FlowJsonDialog
        flowJson={flowJson}
        onOpenChange={setJsonOpen}
        open={jsonOpen}
      />
      <Dialog onOpenChange={setPreviewOpen} open={previewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("miniApps.editor.preview")}</DialogTitle>
          </DialogHeader>
          <div className="h-[600px] overflow-y-auto rounded-xl border">
            {previewOpen ? (
              <MiniAppRunner
                definition={definition}
                onComplete={(answers) => {
                  toast.info(
                    t("miniApps.editor.previewSubmitted", {
                      answers: JSON.stringify(answers),
                    }),
                  )
                  return Promise.resolve()
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {miniAppId ? (
        <PublishWhatsappDialog
          hasUnsavedChanges={dirty}
          miniAppId={miniAppId}
          onOpenChange={setPublishOpen}
          open={publishOpen}
          targets={publishTargets}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}

export function MiniAppEditor(props: MiniAppEditorProps) {
  return (
    <MiniAppEditorProvider
      initial={{ name: props.initialName, definition: props.initialDefinition }}
    >
      <EditorBody
        miniAppId={props.miniAppId}
        publicUrl={props.publicUrl}
        publishTargets={props.publishTargets}
        workspaceId={props.workspaceId}
      />
    </MiniAppEditorProvider>
  )
}
