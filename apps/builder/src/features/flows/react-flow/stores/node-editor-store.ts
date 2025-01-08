import { create } from 'zustand'
import { NodeBaseAhachat } from "@/features/flows/react-flow/types";

interface NodeEditorStore {
  currentNode: Partial<NodeBaseAhachat>
  updateCurrentNode: (payload: NodeBaseAhachat) => void
}

export const useNodeEditorStore = create((set): NodeEditorStore => ({
  currentNode: {}, // Selected node
  updateCurrentNode: (payload: NodeBaseAhachat) => set({ currentNode: payload }),
  // updateImageNode: (payload: any) => set((state: any) => ({
  //   currentNode: { ...state.currentNode, data: { ...state.currentNode.data, image: [payload] } }
  // }))
}))
