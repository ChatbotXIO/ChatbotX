import ky from "ky"
import { type RefObject, useRef } from "react"
import useSWR from "swr"

export const callAPI = <T>(url: string) => {
  const random = useRef(Date.now())
  const { data, error, isLoading } = useSWR<
    T,
    // biome-ignore lint/suspicious/noExplicitAny: wip
    any,
    [string, RefObject<number>]
  >([url, random], (args) => ky.get(args[0]).json())

  return {
    data,
    error,
    isLoading,
  }
}
