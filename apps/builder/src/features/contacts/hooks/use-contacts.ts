import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"
import type { ListContactsRequest } from "../schema/query"

/** Contacts-table page; keeps the previous page on screen while the next
 * page/filter/sort loads. */
export const useContacts = (input: ListContactsRequest) =>
  useQuery(
    orpc.contactsAPIs.listContactsByPOSTAuthenticatedAPI.queryOptions({
      input,
      placeholderData: keepPreviousData,
    }),
  )

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
