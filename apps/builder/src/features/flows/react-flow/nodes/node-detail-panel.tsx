"use client"

import type { FlowNode, NodeType } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { type ReactFlowState, useStore } from "@xyflow/react"
import { CloseCircle } from "iconsax-reactjs"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"

const XIcon = wrapIconsax(CloseCircle as IconsaxComponent)

import { memo } from "react"
import { NodeEditor } from "./editor"
import { NodeNameEditor } from "./node-name-editor"

type NodeDetailPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Select only the selected node from the store
const selectSelectedNode = (state: ReactFlowState): FlowNode | null =>
  (state.nodes.find((node) => node.selected) as FlowNode) || null

// Custom equality function that compares node ID and data reference
// This prevents re-renders from position/dragging changes but allows data updates
const equalityFn = (a: FlowNode | null, b: FlowNode | null): boolean => {
  if (a === b) {
    return true
  }
  if (!a) {
    return false
  }
  if (!b) {
    return false
  }
  return a.id === b.id && a.data === b.data
}

/**
 * Painel lateral NÃO-MODAL pra editar o node selecionado.
 *
 * Diferenças versus o `<Sheet>` do shadcn:
 *  - Sem overlay escuro
 *  - Sem focus trap (canvas continua interativo)
 *  - Sem locking do scroll/body
 *  - Clicar em outro node troca o conteúdo (re-render via React key)
 *  - Slide-in suave da direita via CSS transition
 *
 * Comportamento: Pedro pode arrastar, dar zoom, adicionar nodes enquanto o
 * painel está aberto. Clicar em outro node abre o editor desse novo node
 * (substitui o conteúdo). Botão X fecha.
 */
export function NodeDetailPanel({ open, onOpenChange }: NodeDetailPanelProps) {
  const activeNode = useStore(selectSelectedNode, equalityFn)

  return (
    <aside
      aria-hidden={!(open && activeNode)}
      className={cn(
        // Posicionado à ESQUERDA (estilo BotConversa). Como o fluxo agora
        // corre na horizontal (left → right), faz sentido o painel de edição
        // ficar na esquerda — não cobre o caminho de "saída" do node.
        "absolute top-0 bottom-0 left-0 z-30 flex w-[400px] flex-col border-r bg-background shadow-xl",
        "transition-transform duration-200 ease-out",
        open && activeNode
          ? "translate-x-0"
          : "pointer-events-none -translate-x-full",
      )}
    >
      {activeNode ? (
        <NodeDetailPanelContent
          activeNode={activeNode}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </aside>
  )
}

const NodeDetailPanelContent = memo(
  ({ activeNode, onClose }: { activeNode: FlowNode; onClose: () => void }) => (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <NodeNameEditor activeNode={activeNode} />
        </div>
        <Button
          aria-label="Fechar"
          className="size-8 shrink-0"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {/*
          `key` força re-mount quando muda o node selecionado — evita estado
          stale do editor anterior (ex.: useState locais, controllers do RHF).
        */}
        <NodeEditor
          key={activeNode.id}
          nodeDetails={activeNode.data.details}
          nodeId={activeNode.id}
          nodeType={activeNode.type as NodeType}
        />
      </div>
    </>
  ),
)

NodeDetailPanelContent.displayName = "NodeDetailPanelContent"
