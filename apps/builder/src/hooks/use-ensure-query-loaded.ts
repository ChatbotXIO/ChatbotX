"use client"

import { useCallback, useRef } from "react"

type LazyQuery<T> = {
  data: T | undefined
  isFetching: boolean
  isSuccess: boolean
  refetch: () => Promise<{ data: T | undefined }>
}

export const useEnsureQueryLoaded = <T>(query: LazyQuery<T>) => {
  const stateRef = useRef({
    data: query.data,
    isFetching: query.isFetching,
    isSuccess: query.isSuccess,
  })
  stateRef.current = {
    data: query.data,
    isFetching: query.isFetching,
    isSuccess: query.isSuccess,
  }

  return useCallback(() => {
    const { data, isFetching, isSuccess } = stateRef.current
    if (isSuccess || isFetching) {
      return Promise.resolve(data)
    }

    return query.refetch().then((result) => result.data)
  }, [query.refetch])
}
