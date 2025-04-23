import ky from "ky"
import useSWR from "swr"

export const callAPI = <T>(url: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const { data, error, isLoading } = useSWR<T, any, string>(url, (...args) =>
    ky.get(...args).json(),
  )

  return {
    data,
    error,
    isLoading,
  }
}
