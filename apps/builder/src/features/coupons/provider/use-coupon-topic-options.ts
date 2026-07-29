"use client"

import { useContext, useEffect, useMemo } from "react"
import { useStore } from "zustand"
import {
  type CouponTopicOption,
  createCouponTopicStore,
} from "./coupon-topic-store"
import { CouponTopicStoreContext } from "./coupon-topic-store-context"

type UseCouponTopicOptionsProps = {
  issueableOnly?: boolean
  enabled?: boolean
}

const noopRefresh = async () => undefined
const emptyCouponTopicStore = createCouponTopicStore({ workspaceId: "" })

const isIssueable = (topic: CouponTopicOption) => {
  if (!topic.expiresAt) {
    return true
  }

  return new Date(topic.expiresAt).getTime() > Date.now()
}

export const useCouponTopicOptions = ({
  issueableOnly = false,
  enabled = true,
}: UseCouponTopicOptionsProps = {}) => {
  const couponTopicStoreContext = useContext(CouponTopicStoreContext)
  const store = couponTopicStoreContext ?? emptyCouponTopicStore
  const workspaceId = useStore(store, (state) => state.workspaceId)
  const topics = useStore(store, (state) => state.topics)
  const isInitialized = useStore(store, (state) => state.isInitialized)
  const isLoading = useStore(store, (state) => state.isLoading)
  const error = useStore(store, (state) => state.error)
  const initialize = useStore(store, (state) => state.initialize)
  const refresh = useStore(store, (state) => state.refresh)

  useEffect(() => {
    if (enabled && !(isInitialized || isLoading)) {
      initialize(workspaceId)
    }
  }, [enabled, initialize, isInitialized, isLoading, workspaceId])

  const filteredTopics = useMemo(() => {
    if (!enabled) {
      return []
    }
    return issueableOnly ? topics.filter(isIssueable) : topics
  }, [enabled, issueableOnly, topics])

  const options = useMemo(
    () =>
      filteredTopics.map((topic) => ({
        label: topic.name,
        value: topic.id,
      })),
    [filteredTopics],
  )

  const labelById = useMemo(
    () => new Map(filteredTopics.map((topic) => [topic.id, topic.name])),
    [filteredTopics],
  )

  return {
    topics: filteredTopics,
    options,
    labelById,
    isLoading: enabled ? isLoading : false,
    error: enabled ? error : null,
    refresh: enabled ? refresh : noopRefresh,
  }
}
