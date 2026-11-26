/**
 * Drizzle relational-query `columns` exclusion for a `User` read that can reach
 * a client, a cache, a realtime event, a webhook or a log. Exclusion mode
 * selects every other column (including ones added later), so only the
 * encrypted `connectionAuthorizations` backup is dropped. Apply it to every
 * relational `User` read, both `db.query.userModel.*` and nested
 * `with: { user: { columns: userColumnsWithoutSecrets } }`; core `select()`
 * queries name their columns explicitly and never take the whole row.
 */
export const userColumnsWithoutSecrets = {
  connectionAuthorizations: false,
} as const
