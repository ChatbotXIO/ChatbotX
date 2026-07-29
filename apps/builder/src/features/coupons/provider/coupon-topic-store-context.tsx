"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import {
  type CouponTopicStore,
  createCouponTopicStore,
} from "./coupon-topic-store"

export type CouponTopicStoreApi = ReturnType<typeof createCouponTopicStore>

export const CouponTopicStoreContext = createContext<
  CouponTopicStoreApi | undefined
>(undefined)

export type CouponTopicStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const CouponTopicStoreProvider = ({
  workspaceId,
  autoInitialize = true,
  children,
}: CouponTopicStoreProviderProps) => {
  const storeRef = useRef<CouponTopicStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createCouponTopicStore({ workspaceId })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize(workspaceId)
    }
  }, [autoInitialize, workspaceId])

  return (
    <CouponTopicStoreContext.Provider value={storeRef.current}>
      {children}
    </CouponTopicStoreContext.Provider>
  )
}

export const useCouponTopicStore = <T,>(
  selector: (store: CouponTopicStore) => T,
): T => {
  const couponTopicStoreContext = useContext(CouponTopicStoreContext)

  if (!couponTopicStoreContext) {
    throw new Error(
      "useCouponTopicStore must be used within CouponTopicStoreProvider",
    )
  }

  return useStore(couponTopicStoreContext, selector)
}
