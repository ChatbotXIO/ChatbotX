/**
 * A stand-in for drizzle's `sql` tag that records fragments instead of building
 * real SQL, plus a renderer that flattens them into text and bound parameters.
 * Lets repository tests assert the emitted SQL without a database.
 */
export type FakeSqlFragment = { strings: readonly string[]; values: unknown[] }
type FakeJoin = { __join: unknown[] }

export const fakeSql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]): FakeSqlFragment => ({
    strings: [...strings],
    values,
  }),
  {
    join: (items: unknown[]): FakeJoin => ({ __join: items }),
    identifier: (name: string): FakeSqlFragment => ({
      strings: [`"${name}"`],
      values: [],
    }),
  },
)

const isJoin = (value: unknown): value is FakeJoin =>
  typeof value === "object" && value !== null && "__join" in value
const isFragment = (value: unknown): value is FakeSqlFragment =>
  typeof value === "object" && value !== null && "strings" in value

function flatten(fragment: FakeSqlFragment): {
  text: string
  params: unknown[]
} {
  let text = ""
  const params: unknown[] = []
  fragment.strings.forEach((chunk, index) => {
    text += chunk
    if (index >= fragment.values.length) {
      return
    }
    const value = fragment.values[index]
    const parts = isJoin(value) ? value.__join : [value]
    text += parts
      .map((part) => {
        if (isFragment(part)) {
          const inner = flatten(part)
          params.push(...inner.params)
          return inner.text
        }
        params.push(part)
        return "?"
      })
      .join(", ")
  })
  return { text, params }
}

/** Query text (whitespace collapsed, `?` per bound value) and its parameters. */
export function renderSql(fragment: unknown): {
  text: string
  params: unknown[]
} {
  const { text, params } = flatten(fragment as FakeSqlFragment)
  return { text: text.replace(/\s+/g, " ").trim(), params }
}
