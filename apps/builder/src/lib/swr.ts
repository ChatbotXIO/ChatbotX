import ky from "ky"
import useSWR from "swr"

export const callAPI = (url: string) => {
  const { data, error, isLoading } = useSWR(url, (...args) =>
    ky.get(...args).json(),
  )

  return {
    data,
    error,
    isLoading,
  }
}
