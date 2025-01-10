"use client"

import { buttonBlockDefaultValue } from '@/features/flows/react-flow/blocks/button/schema';
import { sendTextBlockDefaultValue } from '@/features/flows/react-flow/blocks/send-text/schema';
import AddNotesNode from '@/features/flows/react-flow/nodes/add-notes/add-notes-node';
import { SendMessageNodeSchema } from '@/features/flows/react-flow/nodes/send-message/schema';
import SendMessageNodeViewer from '@/features/flows/react-flow/nodes/send-message/viewer';
// import { splitTrafficNodeDefaultValue } from '@/features/flows/react-flow/nodes/split-traffic/schema';
// import SplitTrafficNodeViewer from '@/features/flows/react-flow/nodes/split-traffic/viewer';
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
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useState } from 'react';

const nodeTypes = {
  [PanelAction.SendMessage]: SendMessageNodeViewer,
  // [PanelAction.SplitTraffic]: SplitTrafficNodeViewer,
  [PanelAction.AddNotes]: AddNotesNode,
}

const data: SendMessageNodeSchema = {
  id: createId(),
  name: 'Send Message',
  messageType: "Whatsapp",
  blocks: [
    sendTextBlockDefaultValue("ok chuaw", [
      buttonBlockDefaultValue("bt1"),
      buttonBlockDefaultValue("bt2")
    ])
  ]
}

const initialNodes: any[] = [
  {
    id: '1',
    type: PanelAction.SendMessage,
    position: { x: 200, y: 200 },
    data,
  },
  // {
  //   id: '2',
  //   type: PanelAction.SplitTraffic,
  //   position: { x: 300, y: 300 },
  //   data: splitTrafficNodeDefaultValue()
  // }
];

const initialEdges: Edge[] = [];

export default function FlowPage({ children }: { children: React.ReactNode }) {
  const { t } = useTranslate()

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

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(event: any, node: any) => {
          setActiveNode(node);
          setOpenNodeDetailSheet(true);
        }}
        onPaneClick={() => {
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
    </ReactFlowProvider>
  )
}
