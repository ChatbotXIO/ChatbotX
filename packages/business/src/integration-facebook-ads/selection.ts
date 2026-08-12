export function filterAdAccountsByIds<T extends { id: string }>(
  accounts: T[],
  selectedIds: string[] | null | undefined,
): T[] {
  if (!selectedIds?.length) {
    return accounts
  }

  const trackedIds = new Set(selectedIds)
  return accounts.filter((account) => trackedIds.has(account.id))
}
