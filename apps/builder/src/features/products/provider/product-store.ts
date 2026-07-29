import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"

export type ProductStoreState = {
  initialized: boolean
  isLoading: boolean
  workspaceId: string
  products: Array<{ id: string; name: string }>
  vendors: string[]
}

export type ProductStoreActions = {
  initialize: () => Promise<void>
  getFormOptions: () => Promise<void>
}

export type ProductStore = ProductStoreState & ProductStoreActions

export const createProductStore = (props: Partial<ProductStoreState>) =>
  createStore<ProductStore>((set, get) => ({
    initialized: false,
    isLoading: false,
    products: [],
    vendors: [],
    workspaceId: "",

    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      await get().getFormOptions()
      set({ initialized: true })
    },

    getFormOptions: async () => {
      const { isLoading, workspaceId } = get()

      if (isLoading) {
        return
      }

      set({ isLoading: true })

      try {
        const options = await client.productsAPI.listProductFormOptionsAPI({
          workspaceId,
        })

        set(options)
      } catch {
        set({
          products: [],
          vendors: [],
        })
      } finally {
        set({ isLoading: false })
      }
    },
  }))
