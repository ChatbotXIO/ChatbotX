/**
 * Whether a form still needs an account choice before it can be saved.
 *
 * With two or more accounts of the channel connected, an automation that
 * silently answers on all of them is the exact mistake the scope exists to
 * prevent — so a new automation must pick one, or pick "every account" on
 * purpose (`inboxId` stays `undefined` until then). With zero or one account
 * there is nothing to choose. While the accounts are still loading the answer
 * is unknown, so saving waits too — otherwise a quick submit would slip
 * through as "every account".
 */
export function isAccountChoiceMissing(props: {
  inboxId: string | null | undefined
  accountCount: number
  isLoading: boolean
}): boolean {
  return (
    props.inboxId === undefined && (props.isLoading || props.accountCount > 1)
  )
}

/**
 * The selected post/story ids that can stay when the scope moves to
 * `nextInboxId`: only those KNOWN to belong to that account. An id whose
 * account is unknown (typed by hand, or its list not loaded) is dropped too —
 * keeping another account's post would save an automation that never fires
 * and says nothing, while a dropped one is announced and easy to re-pick.
 */
export function keepTargetsOfAccount(
  ids: string[],
  nextInboxId: string,
  findTargetOwner?: (id: string) => string | undefined,
): string[] {
  if (!findTargetOwner) {
    return []
  }
  return ids.filter((id) => findTargetOwner(id) === nextInboxId)
}
