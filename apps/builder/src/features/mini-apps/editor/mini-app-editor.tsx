"use client"

import {
  type MiniAppComponentType,
  type MiniAppDefinition,
  toFlowJson,
  validateMiniApp,
} from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { SendIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { PublicUrlSection } from "@/components/public-url-section"
import { FlowJsonDialog } from "../components/flow-json-dialog"
import { PublishWhatsappDialog } from "../components/publish-whatsapp-dialog"
import { componentIcon } from "../lib/component-icons"
import { componentLabelKey } from "../lib/labels"
import { useDefaultText } from "../lib/use-default-text"
import type { WhatsappPublishTarget } from "../queries"
import { CanvasContext, ScreenCanvas } from "./canvas"
import { type DragSource, innermostCollision } from "./dnd"
import { MiniAppEditorProvider, useMiniAppEditor } from "./editor-context"
import { EditorToolbar } from "./editor-toolbar"
import { NodeInspector } from "./inspector/node-inspector"
import { ScreenInspector } from "./inspector/screen-inspector"
import { Palette } from "./palette"
import { PreviewDialog } from "./preview-dialog"
import { ScreensBar } from "./screens-bar"
import { useCanvasDnd } from "./use-canvas-dnd"
import { useEditorShortcuts } from "./use-editor-shortcuts"
import { useSaveMiniApp } from "./use-save-mini-app"
import { useUnsavedGuard } from "./use-unsaved-guard"

export type MiniAppEditorProps = {
  workspaceId: string
  miniAppId: string
  /** The shareable link of the Mini App. */
  publicUrl?: string
  initialName: string
  initialDefinition: MiniAppDefinition
  publishTargets: WhatsappPublishTarget[]
}

/** The component being dragged, following the pointer. */
function DragPreview({ source }: { source: DragSource | null }) {
  const t = useTranslations()
  const Icon = source ? componentIcon[source.type] : null
  return (
    <DragOverlay dropAnimation={null}>
      {source && Icon ? (
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm shadow-lg">
          <Icon className="size-4" />
          {t(componentLabelKey[source.type])}
        </div>
      ) : null}
    </DragOverlay>
  )
}

function EditorBody({
  workspaceId,
  miniAppId,
  publicUrl,
  publishTargets,
}: Omit<MiniAppEditorProps, "initialName" | "initialDefinition">) {
  const t = useTranslations()
  const defaultText = useDefaultText()
  const definition = useMiniAppEditor((state) => state.definition)
  const selectedNodeId = useMiniAppEditor((state) => state.selectedNodeId)
  const dirty = useMiniAppEditor((state) => state.dirty)
  const addNode = useMiniAppEditor((state) => state.addNode)

  const [jsonOpen, setJsonOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  const { save, isSaving, nameError } = useSaveMiniApp(workspaceId, miniAppId)
  const { dragSource, dropTarget, dndContextProps } = useCanvasDnd()
  useEditorShortcuts(save)
  useUnsavedGuard(dirty)

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

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] flex-col overflow-hidden rounded-lg border bg-background">
      <EditorToolbar
        isSaving={isSaving}
        issues={validation.issues}
        nameError={nameError}
        onPreview={() => setPreviewOpen(true)}
        onSave={save}
        onViewJson={() => setJsonOpen(true)}
      />
      <ScreensBar />
      <DndContext collisionDetection={innermostCollision} {...dndContextProps}>
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
        <DragPreview source={dragSource} />
      </DndContext>

      <FlowJsonDialog
        flowJson={flowJson}
        onOpenChange={setJsonOpen}
        open={jsonOpen}
      />
      <PreviewDialog onOpenChange={setPreviewOpen} open={previewOpen} />
      <PublishWhatsappDialog
        hasUnsavedChanges={dirty}
        miniAppId={miniAppId}
        onOpenChange={setPublishOpen}
        open={publishOpen}
        targets={publishTargets}
        workspaceId={workspaceId}
      />
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
