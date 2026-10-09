"use client"

import {
  MINI_APP_COMPONENTS,
  type MiniAppNode,
  type MiniAppRuntimeScope,
  type MiniAppSlotAddress,
} from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CopyIcon, GripVerticalIcon, Trash2Icon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { createContext, useContext } from "react"
import { NodeView } from "../components/node-view"
import { componentLabelKey } from "../lib/labels"
import type { DragSource, DropTarget, DropZone } from "./dnd"
import { slotDroppableId } from "./dnd"
import { useMiniAppEditor } from "./editor-context"

export type CanvasContextValue = {
  dropTarget: DropTarget | null
  draggingNodeId: string | null
  nodesWithErrors: ReadonlySet<string>
}

export const CanvasContext = createContext<CanvasContextValue>({
  dropTarget: null,
  draggingNodeId: null,
  nodesWithErrors: new Set(),
})

const DESIGN_SCOPE: MiniAppRuntimeScope = { screenId: "", forms: {} }

function DropLine() {
  return <div className="pointer-events-none h-0.5 rounded-full bg-primary" />
}

function SlotList({
  address,
  nodes,
  label,
}: {
  address: MiniAppSlotAddress
  nodes: MiniAppNode[]
  label?: string
}) {
  const t = useTranslations("miniApps.editor")
  const { dropTarget } = useContext(CanvasContext)
  const zone: DropZone = { kind: "slot", address, length: nodes.length }
  const slotId = slotDroppableId(address)
  const { setNodeRef } = useDroppable({ id: slotId, data: zone })
  const isTarget =
    dropTarget?.highlight.kind === "slot" &&
    dropTarget.highlight.slotId === slotId

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span className="font-medium text-[11px] text-muted-foreground uppercase">
          {label}
        </span>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-2 rounded-md",
          address.parentId && "min-h-12 border border-dashed p-2",
          isTarget && "border-primary bg-primary/5",
        )}
        ref={setNodeRef}
      >
        {nodes.map((node, index) => (
          <CanvasNode
            address={address}
            index={index}
            key={node.id}
            node={node}
          />
        ))}
        {nodes.length === 0 && address.parentId ? (
          <span className="py-2 text-center text-muted-foreground text-xs">
            {t("dropHere")}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function ContainerSlots({
  node,
  screenKey,
}: {
  node: MiniAppNode
  screenKey: string
}) {
  const t = useTranslations("miniApps.editor")
  const slotLabel = (slot: string) => {
    if (node.type === "If") {
      return slot === "then" ? t("slotThen") : t("slotElse")
    }
    if (node.type === "Switch") {
      return t("slotCase", { value: slot })
    }
    return
  }
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(node.slots ?? {}).map(([slot, children]) => (
        <SlotList
          address={{ screenKey, parentId: node.id, slot }}
          key={slot}
          label={slotLabel(slot)}
          nodes={children}
        />
      ))}
    </div>
  )
}

const CONTAINER_SUMMARY_PROP: Partial<Record<MiniAppNode["type"], string>> = {
  If: "condition",
  Switch: "value",
}

function ContainerHeader({ node }: { node: MiniAppNode }) {
  const t = useTranslations()
  const expression = node.props[CONTAINER_SUMMARY_PROP[node.type] ?? "name"]
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
        {t(componentLabelKey[node.type])}
      </span>
      <code className="truncate text-muted-foreground">
        {typeof expression === "string" && expression
          ? expression
          : t("miniApps.editor.noCondition")}
      </code>
    </div>
  )
}

function CanvasNode({
  node,
  address,
  index,
}: {
  node: MiniAppNode
  address: MiniAppSlotAddress
  index: number
}) {
  const t = useTranslations("miniApps.editor")
  const tRoot = useTranslations()
  const { dropTarget, draggingNodeId, nodesWithErrors } =
    useContext(CanvasContext)
  const selectedNodeId = useMiniAppEditor((state) => state.selectedNodeId)
  const selectNode = useMiniAppEditor((state) => state.selectNode)
  const removeNode = useMiniAppEditor((state) => state.removeNode)
  const duplicateNode = useMiniAppEditor((state) => state.duplicateNode)

  const source: DragSource = { kind: "node", nodeId: node.id, type: node.type }
  const zone: DropZone = { kind: "node", nodeId: node.id, address, index }
  const drag = useDraggable({ id: `drag:${node.id}`, data: source })
  const drop = useDroppable({ id: `node:${node.id}`, data: zone })

  const isSelected = selectedNodeId === node.id
  const hasError = nodesWithErrors.has(node.id)
  const isContainer = MINI_APP_COMPONENTS[node.type].slotKind !== undefined
  const highlight = dropTarget?.highlight
  const lineBefore =
    highlight?.kind === "before" && highlight.nodeId === node.id
  const lineAfter = highlight?.kind === "after" && highlight.nodeId === node.id

  return (
    <div className="flex flex-col gap-1" ref={drop.setNodeRef}>
      {lineBefore ? <DropLine /> : null}
      {/* biome-ignore lint/a11y/useSemanticElements: wraps arbitrary preview content */}
      <div
        aria-label={tRoot(componentLabelKey[node.type])}
        className={cn(
          "group relative cursor-pointer rounded-md border border-transparent p-1.5 transition-colors hover:border-primary/40",
          isContainer && "border-muted-foreground/30 border-dashed bg-muted/20",
          isSelected && "border-primary ring-1 ring-primary",
          hasError && !isSelected && "border-destructive",
          draggingNodeId === node.id && "opacity-40",
        )}
        onClick={(event) => {
          event.stopPropagation()
          selectNode(node.id)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.stopPropagation()
            selectNode(node.id)
          }
        }}
        ref={drag.setNodeRef}
        role="button"
        tabIndex={0}
      >
        <div
          className={cn(
            "absolute end-1 -top-3 z-10 hidden items-center gap-0.5 rounded-md border bg-background shadow-sm group-hover:flex",
            isSelected && "flex",
          )}
        >
          <button
            aria-label={t("drag")}
            className="cursor-grab p-1 text-muted-foreground hover:text-foreground"
            type="button"
            {...drag.listeners}
            {...drag.attributes}
          >
            <GripVerticalIcon className="size-3.5" />
          </button>
          <button
            aria-label={t("duplicate")}
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation()
              duplicateNode(node.id)
            }}
            type="button"
          >
            <CopyIcon className="size-3.5" />
          </button>
          <button
            aria-label={t("remove")}
            className="p-1 text-muted-foreground hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation()
              removeNode(node.id)
            }}
            type="button"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
        {isContainer ? (
          <div className="flex flex-col gap-2">
            <ContainerHeader node={node} />
            <ContainerSlots node={node} screenKey={address.screenKey} />
          </div>
        ) : (
          <div className="pointer-events-none">
            <NodeView mode="design" node={node} scope={DESIGN_SCOPE} />
          </div>
        )}
      </div>
      {lineAfter ? <DropLine /> : null}
    </div>
  )
}

/** The phone-shaped preview of the selected screen. */
export function ScreenCanvas() {
  const t = useTranslations("miniApps.editor")
  const definition = useMiniAppEditor((state) => state.definition)
  const selectedScreenKey = useMiniAppEditor((state) => state.selectedScreenKey)
  const selectNode = useMiniAppEditor((state) => state.selectNode)
  const screen = definition.screens.find(
    (candidate) => candidate.key === selectedScreenKey,
  )

  if (!screen) {
    return null
  }

  return (
    <div className="flex h-full justify-center overflow-y-auto bg-muted/40 p-6">
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: clicking the phone background clears the selection; Escape does the same from the keyboard */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: same as above */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same as above */}
      <div
        className="flex h-fit min-h-[640px] w-[360px] flex-col overflow-hidden rounded-[28px] border-8 border-neutral-900 bg-white shadow-xl"
        onClick={() => selectNode(null)}
      >
        <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
          <XIcon className="size-5 text-[#54656f]" />
          <span className="flex-1 truncate font-medium text-[#111b21] text-[16px]">
            {screen.title || screen.id}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <SlotList
            address={{ screenKey: screen.key }}
            nodes={screen.children}
          />
          {screen.children.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground text-sm">
              {t("emptyScreen")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
