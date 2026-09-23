import {
  hashKey,
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"
import type { ListContactsRequest, ListContactsResponse } from "../schema/query"

type ContactsSeed = {
  input: ListContactsRequest
  response: ListContactsResponse
}

type UseContactsOptions = {
  enabled?: boolean
}

export const useContacts = (
  input: ListContactsRequest,
  seed: ContactsSeed,
  options: UseContactsOptions = {},
) => {
  const queryOptions =
    orpc.contactsAPIs.listContactsByPOSTAuthenticatedAPI.queryOptions({ input })
  const seedQueryOptions =
    orpc.contactsAPIs.listContactsByPOSTAuthenticatedAPI.queryOptions({
      input: seed.input,
    })
  const hasMatchingSeed =
    hashKey(queryOptions.queryKey) === hashKey(seedQueryOptions.queryKey)

  return useQuery({
    ...queryOptions,
    enabled: options.enabled,
    initialData: hasMatchingSeed ? seed.response : undefined,
    placeholderData: keepPreviousData,
  })
}

export const useInvalidateContacts = () => {
  const queryClient = useQueryClient()

  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.contactsAPIs.listContactsByPOSTAuthenticatedAPI.key(),
      }),
    [queryClient],
  )
}
