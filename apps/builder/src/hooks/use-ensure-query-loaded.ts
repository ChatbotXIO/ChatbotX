"use client"

import { useCallback, useRef } from "react"

type LazyQuery<T> = {
  data: T | undefined
  isFetched: boolean
  isFetching: boolean
  refetch: () => Promise<{ data: T | undefined }>
}

export const useEnsureQueryLoaded = <T>(query: LazyQuery<T>) => {
  const stateRef = useRef({
    data: query.data,
    isFetched: query.isFetched,
    isFetching: query.isFetching,
  })
  stateRef.current = {
    data: query.data,
    isFetched: query.isFetched,
    isFetching: query.isFetching,
  }

  return useCallback(() => {
    const { data, isFetched, isFetching } = stateRef.current
    if (isFetched || isFetching) {
      return Promise.resolve(data)
    }

    return query.refetch().then((result) => result.data)
  }, [query.refetch])
}
