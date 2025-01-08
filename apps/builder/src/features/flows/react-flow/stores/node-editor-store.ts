import { create } from 'zustand'

interface NodeEditorStore {
  currentNode: Record<string, unknown>
  updateCurrentNode: (payload: Record<string, unknown>) => void
}

export const useNodeEditorStore = create((set): NodeEditorStore => ({
  currentNode: {}, // Selected node
  updateCurrentNode: (payload: Record<string, unknown>) => set({ currentNode: payload }),
  // updateImageNode: (payload: any) => set((state: any) => ({
  //   currentNode: { ...state.currentNode, data: { ...state.currentNode.data, image: [payload] } }
  // }))
}))
