import useSWRImmutable from "swr/immutable"

export const useClientQuery = <T>(
  key: readonly unknown[] | null,
  fetcher: () => Promise<T>,
) => {
  const { data, error, isLoading } = useSWRImmutable<T>(key, fetcher)

  return {
    data,
    error,
    isLoading,
  }
}
