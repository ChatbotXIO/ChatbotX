import { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"
import { maxPerPageString } from "@/lib/shared-request"
import type { ProductResource } from "../schema/resource"

export type ProductStoreState = {
  initialized: boolean
  isLoading: boolean
  workspaceId: string
  products: ProductResource[]
  error: string | null
}

export type ProductStoreActions = {
  initialize: () => Promise<void>
  getAllProducts: () => Promise<void>
  deleteProduct: (id: string) => void
  upsertProduct: (product: ProductResource) => void
}

export type ProductStore = ProductStoreState & ProductStoreActions

export const createProductStore = (props: Partial<ProductStoreState>) =>
  createStore<ProductStore>((set, get) => ({
    initialized: false,
    isLoading: false,
    products: [],
    workspaceId: "",
    error: null,

    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllProducts()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch products",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllProducts: async () => {
      const { isLoading, workspaceId } = get()

      if (isLoading) {
        return
      }

      set({ isLoading: true })

      try {
        const { data } = await client.productsAPI.listProductsAuthorizedAPI({
          workspaceId,
          perPage: maxPerPageString,
          sort: undefined,
        })

        set({ products: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch products",
        })
      } finally {
        set({ isLoading: false })
      }
    },

    deleteProduct: (id) => {
      set((state) => ({
        products: state.products.filter((item) => item.id !== id),
      }))
    },

    upsertProduct: (product) => {
      set((state) => {
        const existingIndex = state.products.findIndex(
          (item) => item.id === product.id,
        )

        if (existingIndex === -1) {
          return { products: [product, ...state.products] }
        }

        return {
          products: state.products.map((item) =>
            item.id === product.id ? product : item,
          ),
        }
      })
    },
  }))
