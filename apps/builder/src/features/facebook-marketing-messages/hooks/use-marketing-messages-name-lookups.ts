import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { orpc } from "@/lib/orpc/query"

/**
 * Page and ad-account display names for rows that only store ids. Shared by the
 * campaigns and audiences tables so both resolve names the same way.
 *
 * Ad account names come from Meta, so that query needs a live grant — it is
 * skipped while the grant is expired (`readOnly`) instead of firing a request
 * that can only fail.
 */
export function useMarketingMessagesNameLookups(
  workspaceId: string,
  readOnly: boolean,
) {
  // The row only stores `pageId`; the name lives on the Messenger integration.
  const pages = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesPagesAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )
  const pageNameById = useMemo(
    () =>
      new Map(
        (pages.data?.pages ?? []).map((page) => [page.pageId, page.name]),
      ),
    [pages.data],
  )

  const adAccounts = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesAdAccountsAPI.queryOptions(
      { input: { workspaceId }, enabled: !readOnly },
    ),
  )
  const adAccountNameById = useMemo(
    () =>
      new Map(
        (adAccounts.data?.accounts ?? []).map((account) => [
          account.id,
          account.name,
        ]),
      ),
    [adAccounts.data],
  )

  return { pageNameById, adAccountNameById }
}
