const DEFAULT_POLL_INTERVAL_MS = 5000

type QueryWithStatusData<TData extends { status: string }> = {
  state: { data?: TData }
}

/**
 * `refetchInterval` callback for a status-polling query (export jobs, async
 * worker results, ...): keeps refetching every `intervalMs` until the
 * latest data's `status` is one of `settledStatuses`, then stops. TanStack
 * v5 passes the `Query` itself to `refetchInterval` (not the data), hence
 * reading `query.state.data`. Generic over the full data shape `TData`
 * (not just `{ status }`) so assigning this to `queryOptions(...).refetchInterval`
 * doesn't narrow the query's inferred data type to a `status`-only shape.
 */
export function pollUntilSettled<TData extends { status: string }>(
  settledStatuses: readonly TData["status"][],
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
) {
  return (query: QueryWithStatusData<TData>): number | false => {
    const status = query.state.data?.status
    if (status && (settledStatuses as readonly string[]).includes(status)) {
      return false
    }
    return intervalMs
  }
}
