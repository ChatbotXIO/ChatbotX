"use client"

import AddNotesNode from '@/features/flows/react-flow/nodes/add-notes/add-notes-node';
import SendMessageNode from '@/features/flows/react-flow/nodes/send-message/send-message-node';
import { AddBlockButton } from '@/features/flows/react-flow/panels/add-block';
import { NodeDetailSheet } from '@/features/flows/react-flow/panels/node-detail-sheet';
import { PanelAction } from '@/features/flows/react-flow/types';
import { createId } from '@paralleldrive/cuid2';
import { useTranslate } from '@tolgee/react';
import {
  addEdge,
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { useCallback, useState, useEffect } from 'react';

import type { NodeBaseAhachat } from "@/features/flows/react-flow/blocks/types";

import NodeEditorProvider from "@/features/flows/react-flow/stores/node-editor-provider";
import { useNodeEditorStore } from "@/features/flows/react-flow/stores/node-editor-store";

const nodeTypes = {
  [PanelAction.SendMessage]: SendMessageNode,
  [PanelAction.AddNotes]: AddNotesNode,
}

const initialNodes: NodeBaseAhachat[] = [
  { id: '1', type: PanelAction.SendMessage, position: { x: 200, y: 200 },
    data: {
      label: 'Send Message',
      blocks: []
    }
  }
];

const initialEdges: Edge[] = [];

export default function FlowPage({ children }: { children: React.ReactNode }) {
  const { t } = useTranslate()
  const { currentNode, updateCurrentNode } = useNodeEditorStore()

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [activeNode, setActiveNode] = useState<Node | null>(null)
  const [openNodeDetailSheet, setOpenNodeDetailSheet] = useState<boolean>(false);

  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onChooseAction = (name: PanelAction) => {
    let newNode: any | undefined
    if (name == PanelAction.SendMessage) {
      let labelVersion = 0
      nodes.forEach((node) => {
        if (node.type == PanelAction.SendMessage) {
          const matched = node.data.label.match(/^Send Message #(\d+)$/);
          if (matched) {
            const version = parseInt(matched[1] ?? '0', 10)
            if (version > labelVersion) {
              labelVersion = version
            }
          }
        }
      }, 0)

      newNode = {
        id: createId(),
        type: PanelAction.SendMessage,
        position: {
          x: 100,
          y: 100,
        },
        data: {
          label: `Send Message #${labelVersion + 1}`,
          message: "\u00A0"
        }
      }
    }

    if (name == PanelAction.AddNotes) {
      newNode = {
        id: createId(),
        type: PanelAction.AddNotes,
        position: {
          x: 100,
          y: 100,
        },
        data: {
          label: t("flows.addNotes"),
          message: "\u00A0"
        }
      }
    }

    if (newNode) {
      setNodes((nds) => nds.concat(newNode))
    }
  }

  // update node selected
  useEffect(() => {
    setNodes((nds) => nds.map((node) => {
      if (node.id === currentNode.id) {
        return {
          ...node,
          data: {
            ...node.data,
            ...currentNode.data
          }
        }
      }
      return node
    }))
  }, [currentNode])

  return (
    <NodeEditorProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(event: any, node: any) => {
          updateCurrentNode(node)
          setActiveNode(node);
          setOpenNodeDetailSheet(true);
        }}
        onPaneClick={() => {
          updateCurrentNode({})
          setActiveNode(null);
          setOpenNodeDetailSheet(false);
        }}
      >
        <MiniMap />
        <Background />
        <Panel position="bottom-center">
          <Controls orientation="horizontal">
            <AddBlockButton onChooseAction={onChooseAction} />
          </Controls>
        </Panel>
      </ReactFlow>

      <NodeDetailSheet open={openNodeDetailSheet} onOpenChange={setOpenNodeDetailSheet} activeNode={activeNode} />
    </NodeEditorProvider>
  )
}
