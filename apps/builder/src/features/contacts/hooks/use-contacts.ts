import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"
import type { ListContactsRequest } from "../schema/query"

type UseContactsOptions = {
  enabled?: boolean
}

export const useContacts = (
  input: ListContactsRequest,
  options: UseContactsOptions = {},
) => {
  const queryOptions =
    orpc.contactsAPIs.listContactsByPOSTAuthenticatedAPI.queryOptions({ input })

  return useQuery({
    ...queryOptions,
    enabled: options.enabled,
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
