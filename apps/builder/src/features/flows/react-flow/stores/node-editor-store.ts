import { create } from 'zustand'

export const useNodeEditorStore = create((set) => ({
  currentNode: {}, // Selected node
  updateCurrentNode: (payload: any) => set({ currentNode: payload }),
  updateImageNode: (payload: any) => set((state: any) => ({
    currentNode: { ...state.currentNode, data: { ...state.currentNode.data, image: [payload] } }
  }))
}))
