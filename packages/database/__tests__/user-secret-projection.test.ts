import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { getTableColumns } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import { db, findOrFail } from "../src/client"
import { relations } from "../src/relations"
import { contactRepository, userRepository } from "../src/repositories"
import { userColumnsWithoutSecrets } from "../src/repositories/user/columns"
import { userModel } from "../src/schema"

const SECRET_COLUMN = "connectionAuthorizations"
const REPO_ROOT = resolve(import.meta.dirname, "../../..")
const SOURCE_ROOTS = ["apps", "packages", "integrations"]
const SKIPPED_DIRECTORIES = new Set([
  ".next",
  ".turbo",
  "__tests__",
  "dist",
  "migrations",
  "node_modules",
])
const SOURCE_FILE = /\.(ts|tsx)$/
const USER_TABLE_KEY = "userModel"

type RelationConfig = { targetTableName: string }
type TableRelations = { relations: Record<string, RelationConfig> }

/** Every relation name (`user`, `owner`, `assignedUser`, ...) that targets `User`. */
function userRelationNames(): string[] {
  const names = new Set<string>()
  for (const table of Object.values(
    relations as unknown as Record<string, TableRelations>,
  )) {
    for (const [name, relation] of Object.entries(table.relations)) {
      if (relation.targetTableName === USER_TABLE_KEY) {
        names.add(name)
      }
    }
  }
  return [...names]
}

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        yield* sourceFiles(join(directory, entry.name))
      }
    } else if (SOURCE_FILE.test(entry.name)) {
      yield join(directory, entry.name)
    }
  }
}

describe("userColumnsWithoutSecrets", () => {
  test("excludes exactly the secret column and is a real User column", () => {
    expect(userColumnsWithoutSecrets).toEqual({ [SECRET_COLUMN]: false })
    expect(Object.keys(getTableColumns(userModel))).toContain(SECRET_COLUMN)
  })

  test("a relational read with it selects every other column but not the secret one", () => {
    const { sql } = db.query.userModel
      .findFirst({
        where: { id: "user-1" },
        columns: userColumnsWithoutSecrets,
      })
      .toSQL()

    expect(sql).not.toContain(SECRET_COLUMN)
    for (const column of Object.keys(getTableColumns(userModel))) {
      if (column !== SECRET_COLUMN) {
        expect(sql).toContain(`"${column}"`)
      }
    }
  })

  test("a nested read of the user relation with it omits the secret column", () => {
    const { sql } = db.query.workspaceMemberModel
      .findMany({
        where: { workspaceId: "1" },
        with: { user: { columns: userColumnsWithoutSecrets } },
      })
      .toSQL()

    expect(sql).not.toContain(SECRET_COLUMN)
    expect(sql).toContain('"email"')
  })

  test("a nested read of the user relation without it would select the secret column", () => {
    const { sql } = db.query.workspaceMemberModel
      .findMany({ where: { workspaceId: "1" }, with: { user: true } })
      .toSQL()

    expect(sql).toContain(SECRET_COLUMN)
  })
})

describe("userRepository.findById", () => {
  test("reads the user without the secret column", async () => {
    const queries: string[] = []
    const tx = {
      query: {
        userModel: {
          findFirst: (config: { columns?: Record<string, boolean> }) => {
            queries.push(JSON.stringify(config.columns))
            return Promise.resolve(undefined)
          },
        },
      },
    }

    await userRepository.findById("user-1", tx as never)

    expect(queries).toEqual([JSON.stringify({ [SECRET_COLUMN]: false })])
  })
})

describe("findOrFail with an excluded column", () => {
  const stubClient = (rows: unknown[]) => {
    const selections: string[][] = []
    const client = {
      select: (selection?: Record<string, unknown>) => {
        selections.push(selection ? Object.keys(selection) : [])
        const chain = {
          from: () => chain,
          where: () => chain,
          limit: () => chain,
          // biome-ignore lint/suspicious/noThenProperty: awaitable query stub
          then: (resolve: (value: unknown[]) => void) => resolve(rows),
        }
        return chain
      },
    }
    return { client, selections }
  }

  test("selects every column except the excluded one", async () => {
    const { client, selections } = stubClient([{ id: "user-1" }])

    await findOrFail({
      client: client as never,
      table: userModel,
      where: { id: "user-1" },
      columns: userColumnsWithoutSecrets,
    })

    const expected = Object.keys(getTableColumns(userModel)).filter(
      (column) => column !== SECRET_COLUMN,
    )
    expect(selections).toEqual([expected])
  })

  test("without exclusions keeps the plain select of the whole row", async () => {
    const { client, selections } = stubClient([{ id: "user-1" }])

    await findOrFail({
      client: client as never,
      table: userModel,
      where: { id: "user-1" },
    })

    expect(selections).toEqual([[]])
  })
})

describe("contact public reads that include the assigned user", () => {
  type Config = {
    with: { conversation: { with: { assignedUser: unknown } } }
  }
  const projection = { columns: { [SECRET_COLUMN]: false } }
  const tx = {
    query: {
      contactModel: {
        findFirst: (config: unknown) => config,
        findMany: (config: unknown) => config,
      },
    },
  } as never
  const list = { where: {}, limit: 1, offset: 0, orderBy: {} }

  test("findPublicById, listWithRelations and listPublicByCustomField project it", async () => {
    const byId = contactRepository.findPublicById(
      { workspaceId: "1", id: "2" },
      tx,
    ) as unknown as Config
    const withRelations = contactRepository.listWithRelations(
      list,
      tx,
    ) as unknown as Config
    const byCustomField = (await contactRepository.listPublicByCustomField(
      list,
      tx,
    )) as unknown as { data: Config }

    for (const config of [byId, withRelations, byCustomField.data]) {
      expect(config.with.conversation.with.assignedUser).toEqual(projection)
    }
  })
})

describe("contact reads that include the assigned user", () => {
  test("load the assigned user without the secret column", () => {
    const findMany = (config: unknown) => config
    const tx = { query: { contactModel: { findMany } } }

    const config = contactRepository.listWithInboxesAndConversation(
      { where: {}, limit: 1, offset: 0, orderBy: {} },
      tx as never,
    ) as unknown as {
      with: {
        conversation: { with: { assignedUser: { columns: unknown } } }
      }
    }

    expect(config.with.conversation.with.assignedUser).toEqual({
      columns: { [SECRET_COLUMN]: false },
    })
  })
})

// --- Source scanner -------------------------------------------------------
//
// Known limitation: a relation config passed through a const or a spread
// (`with: relationsConst`, `{ ...base }`) is not followed; only literal
// `with: { <relation>: ... }` objects are checked.

const PROJECTION_KEY = "columns"
const EMPTY_SELECT = /\bselect\(\s*\)/g
const USER_ALIAS_DECLARATION = /\b(\w+)\s*=\s*alias\(\s*userModel\b/g
const WITH_KEY_BEFORE = /\bwith\s*:\s*$/
/** Paths (relative to the repo root) allowed to read `User` without a projection. */
const UNPROJECTED_READ_ALLOW_LIST: readonly string[] = [
  // Dev-only seed script: the row is only used for its id, never serialized.
  "packages/database/src/seed/",
]
/** Paths allowed to select the whole `User` table or its column map. */
const WHOLE_TABLE_ALLOW_LIST: readonly string[] = [
  // The projection helper and the repository own every whole-row access.
  "packages/database/src/repositories/user/",
]

/** Blank out comments and string/template contents, keeping offsets and newlines. */
function blankCommentsAndStrings(source: string): string {
  const out = source.split("")
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) {
      if (out[k] !== "\n") {
        out[k] = " "
      }
    }
  }
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i)
      const stop = end === -1 ? source.length : end
      blank(i, stop)
      i = stop
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2)
      const stop = end === -1 ? source.length : end + 2
      blank(i, stop)
      i = stop
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1
      while (j < source.length && source[j] !== ch) {
        j += source[j] === "\\" ? 2 : 1
      }
      blank(i + 1, j)
      i = j + 1
    } else {
      i++
    }
  }
  return out.join("")
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchingBrace(code: string, open: number): number {
  let depth = 0
  for (let k = open; k < code.length; k++) {
    if (code[k] === "{") {
      depth++
    } else if (code[k] === "}") {
      depth--
      if (depth === 0) {
        return k
      }
    }
  }
  return -1
}

/** Whether the object body (between braces) has `columns` as a top-level key. */
function hasTopLevelColumns(body: string): boolean {
  let depth = 0
  let top = ""
  for (const ch of body) {
    if ("{[(".includes(ch)) {
      depth++
    } else if ("}])".includes(ch)) {
      depth--
    } else if (depth === 0) {
      top += ch
    }
  }
  return new RegExp(`(^|[,\\s])${PROJECTION_KEY}\\s*(:|,|$)`).test(top)
}

/** Whether the `{` at `open` is the value of a `with:` key. */
function isWithObject(code: string, open: number): boolean {
  return WITH_KEY_BEFORE.test(code.slice(Math.max(0, open - 40), open))
}

/** Index of the `{` that encloses `index`, or -1. */
function enclosingBrace(code: string, index: number): number {
  let depth = 0
  for (let k = index - 1; k >= 0; k--) {
    if (code[k] === "}") {
      depth++
    } else if (code[k] === "{") {
      if (depth === 0) {
        return k
      }
      depth--
    }
  }
  return -1
}

/** Offsets of unprojected `User` reads in one source file's text. */
function findUnprojectedUserReads(
  source: string,
  relationNames: readonly string[],
): { offset: number; reason: string }[] {
  const code = blankCommentsAndStrings(source)
  const found: { offset: number; reason: string }[] = []
  const names = relationNames.join("|")

  for (const match of code.matchAll(
    new RegExp(`\\b(${names})\\s*:\\s*true\\b`, "g"),
  )) {
    found.push({ offset: match.index, reason: `${match[1]}: true` })
  }

  for (const match of code.matchAll(
    new RegExp(`\\b(${names})\\s*:\\s*\\{`, "g"),
  )) {
    const open = match.index + match[0].length - 1
    const parent = enclosingBrace(code, match.index)
    if (parent === -1 || !isWithObject(code, parent)) {
      continue
    }
    const close = matchingBrace(code, open)
    if (close === -1 || !hasTopLevelColumns(code.slice(open + 1, close))) {
      found.push({
        offset: match.index,
        reason: `${match[1]}: {} without columns`,
      })
    }
  }

  for (const match of code.matchAll(
    /\bquery\.userModel\.(findFirst|findMany)\(\s*/g,
  )) {
    const at = match.index + match[0].length
    const close = code[at] === "{" ? matchingBrace(code, at) : -1
    if (close === -1 || !hasTopLevelColumns(code.slice(at + 1, close))) {
      found.push({
        offset: match.index,
        reason: `query.userModel.${match[1]} without columns`,
      })
    }
  }
  return found
}

/** End offset of the method chain that starts at `start` (a `select(` call). */
function chainEnd(code: string, start: number): number {
  let depth = 0
  let k = start
  for (; k < code.length; k++) {
    if (code[k] === "(") {
      depth++
    } else if (code[k] === ")") {
      depth--
      if (depth === 0) {
        const rest = code.slice(k + 1)
        const gap = rest.length - rest.trimStart().length
        if (rest[gap] !== ".") {
          return k + 1
        }
      }
    }
  }
  return k
}

/** Offsets of whole-table `User` accesses (`select().from(userModel)`, `getTableColumns(userModel)`, an argument-less `select()` joining `User`). */
function findWholeUserTableReads(
  source: string,
): { offset: number; reason: string }[] {
  const code = blankCommentsAndStrings(source)
  const patterns: [RegExp, string][] = [
    [
      /\bselect\(\s*\)\s*\.from\(\s*userModel\s*\)/g,
      "select().from(userModel)",
    ],
    [/\bgetTableColumns\(\s*userModel\b/g, "getTableColumns(userModel)"],
  ]
  const found = patterns.flatMap(([pattern, reason]) =>
    [...code.matchAll(pattern)].map((match) => ({
      offset: match.index,
      reason,
    })),
  )

  // An argument-less `select()` returns every column of each joined table, so
  // joining `User` (directly or through an `alias(userModel, ...)` variable)
  // returns the whole User row.
  const joinable = [
    "userModel",
    ...[...code.matchAll(USER_ALIAS_DECLARATION)].map(
      (match) => match[1] ?? "",
    ),
  ].join("|")
  const userJoin = new RegExp(`\\.\\w*[jJ]oin\\(\\s*(${joinable})\\b`)
  for (const match of code.matchAll(EMPTY_SELECT)) {
    const chain = code.slice(match.index, chainEnd(code, match.index))
    if (userJoin.test(chain)) {
      found.push({ offset: match.index, reason: "select() joining userModel" })
    }
  }
  return found
}

function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length
}

describe("user-secret source scanner", () => {
  const relationNames = ["user", "assignedUser"]
  const reasons = (source: string) =>
    findUnprojectedUserReads(source, relationNames).map((f) => f.reason)

  test("flags `relation: true`", () => {
    expect(reasons("x({ with: { user: true } })")).toEqual(["user: true"])
  })

  test("flags a with-object relation lacking columns, on one or many lines", () => {
    expect(
      reasons("x({ with: { user: { with: { a: true } } } })"),
    ).toHaveLength(1)
    expect(
      reasons("x({ with: {\n  user: {\n    with: { a: true },\n  },\n} })"),
    ).toHaveLength(1)
    expect(reasons("x({ with: { user: { where: { id: 1 } } } })")).toHaveLength(
      1,
    )
    expect(reasons("x({ with: { user: {} } })")).toHaveLength(1)
  })

  test("accepts a with-object relation with a top-level columns key", () => {
    expect(
      reasons("x({ with: { user: { columns: { name: true } } } })"),
    ).toEqual([])
    expect(
      reasons("x({ with: { user: { columns: userColumnsWithoutSecrets } } })"),
    ).toEqual([])
    expect(
      reasons("x({ with: { user: { columns, with: { a: true } } } })"),
    ).toEqual([])
  })

  test("a `columns` key nested deeper does not count", () => {
    expect(
      reasons(
        "x({ with: { user: { with: { a: { columns: { id: true } } } } } })",
      ),
    ).toHaveLength(1)
  })

  test("ignores type annotations and non-with objects", () => {
    expect(reasons("type A = { user: { id: string } }")).toEqual([])
    expect(
      reasons("const a = { actor: { userId: 1 }, user: { sourceId: 2 } }"),
    ).toEqual([])
  })

  test("ignores comments and strings", () => {
    expect(reasons("// with: { user: true }\nconst a = 'user: true'")).toEqual(
      [],
    )
    expect(reasons("/* user: true */")).toEqual([])
  })

  test("flags top-level user queries without columns, including a call with no argument", () => {
    expect(reasons("db.query.userModel.findFirst()")).toHaveLength(1)
    expect(
      reasons("db.query.userModel.findFirst({ where: { id } })"),
    ).toHaveLength(1)
    expect(reasons("tx.query.userModel.findMany(args)")).toHaveLength(1)
    expect(
      reasons(
        "db.query.userModel.findFirst({\n where: { id },\n columns: { name: true },\n})",
      ),
    ).toEqual([])
  })

  test("flags whole-table selects of User", () => {
    const reasonsOf = (source: string) =>
      findWholeUserTableReads(source).map((f) => f.reason)
    expect(reasonsOf("db.select().from(userModel)")).toEqual([
      "select().from(userModel)",
    ])
    expect(reasonsOf("db\n  .select()\n  .from(userModel)")).toHaveLength(1)
    expect(reasonsOf("getTableColumns(userModel)")).toHaveLength(1)
    expect(
      reasonsOf("db.select({ id: userModel.id }).from(userModel)"),
    ).toEqual([])
    expect(reasonsOf("db.select().from(contactModel)")).toEqual([])
    expect(
      reasonsOf(
        "db.select().from(a).leftJoin(userModel, eq(a.u, userModel.id))",
      ),
    ).toEqual(["select() joining userModel"])
    expect(
      reasonsOf(
        "const u = alias(userModel, 'u')\ndb\n  .select()\n  .from(a)\n  .innerJoin(\n    u,\n    eq(a.u, u.id),\n  )\n",
      ),
    ).toEqual(["select() joining userModel"])
    expect(
      reasonsOf(
        "db.select({ id: a.id }).from(a).leftJoin(userModel, eq(a.u, userModel.id))",
      ),
    ).toEqual([])
    expect(
      reasonsOf("db.select().from(a).leftJoin(b, eq(a.b, b.id))\nuserModel"),
    ).toEqual([])
  })
})

describe("relation reads of User in source", () => {
  test("derives the relation names that point at User", () => {
    expect(userRelationNames()).toEqual(
      expect.arrayContaining(["user", "owner", "assignedUser", "createdBy"]),
    )
  })

  // A relation to `User` loaded without `columns` (or a top-level `userModel`
  // query without it) selects every column, secret included. Each such read
  // must pass `columns: userColumnsWithoutSecrets` or an explicit column list.
  test("no read of User loads the whole row", () => {
    const names = userRelationNames()
    const offenders: string[] = []

    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(join(REPO_ROOT, root))) {
        const relative = file.slice(REPO_ROOT.length + 1)
        const source = readFileSync(file, "utf8")
        const startsWith = (list: readonly string[]) =>
          list.some((prefix) => relative.startsWith(prefix))
        const findings = [
          ...(startsWith(UNPROJECTED_READ_ALLOW_LIST)
            ? []
            : findUnprojectedUserReads(source, names)),
          ...(startsWith(WHOLE_TABLE_ALLOW_LIST)
            ? []
            : findWholeUserTableReads(source)),
        ]
        for (const finding of findings) {
          offenders.push(
            `${relative}:${lineOf(source, finding.offset)} ${finding.reason}`,
          )
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
