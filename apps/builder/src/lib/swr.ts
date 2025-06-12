import ky from "ky"
import { useRef, type RefObject } from "react"
import useSWR from "swr"

export const callAPI = <T>(url: string) => {
  const random = useRef(Date.now())
  const { data, error, isLoading } = useSWR<
    T,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    any,
    [string, RefObject<number>]
  >([url, random], (args) => ky.get(args[0]).json())

  return {
    data,
    error,
    isLoading,
  }
}
