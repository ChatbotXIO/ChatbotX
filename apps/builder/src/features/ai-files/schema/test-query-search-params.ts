import { parseAsArrayOf, parseAsInteger, parseAsString } from "nuqs"

export const TEST_QUERY_MAX_FILES = 20
export const TEST_QUERY_MAX_QUESTION = 500
export const TEST_QUERY_MAX_EXPECTED = 200
export const TEST_QUERY_DEFAULT_LIMIT = 5

/**
 * Test Query state kept in the URL so a run can be shared with a teammate.
 * Opening a link never runs the
 * search: each run spends an embedding on the workspace's own key.
 */
export const testQuerySearchParsers = {
  fileIds: parseAsArrayOf(parseAsString).withDefault([]),
  q: parseAsString.withDefault(""),
  expected: parseAsString.withDefault(""),
  limit: parseAsInteger.withDefault(TEST_QUERY_DEFAULT_LIMIT),
}
