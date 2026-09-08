import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

/**
 * Validates `.agents/skills/` — the runbooks AI agents load before writing code.
 *
 * Nothing else in the repo checks these files, so a malformed skill (bad
 * frontmatter, a directory/name mismatch, a dangling symlink, or a skill missing
 * from the CLAUDE.md routing table) used to ship silently and stay undiscoverable.
 */

const root = process.cwd()
const SKILLS_DIR = ".agents/skills"
const ROUTING_TABLE = "CLAUDE.md"
const SYMLINK_ROOTS = [".agents", ".claude", ".cursor"]

const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---/
const FRONTMATTER_KEY = /^([A-Za-z][\w-]*):\s*(.*)$/
const QUOTE_WRAPPER = /^["']|["']$/g
const FOLD_MARKER = /^>-?\s*/
const TABLE_SKILL_CELL = /^\|[^|]*\|\s*`([a-z0-9-]+)`\s*\|/gm

const violations = []
const report = (file, message) => violations.push({ file, message })

const parseFrontmatter = (content) => {
  const match = FRONTMATTER_BLOCK.exec(content)

  if (!match) {
    return null
  }

  const fields = {}
  // Only top-level `key:` pairs matter here; folded (`>-`) values continue on
  // indented lines, so treat any indented line as a continuation of the last key.
  let currentKey = null

  for (const line of match[1].split("\n")) {
    const keyMatch = FRONTMATTER_KEY.exec(line)

    if (keyMatch) {
      currentKey = keyMatch[1]
      fields[currentKey] = keyMatch[2].replace(QUOTE_WRAPPER, "").trim()
      continue
    }

    if (currentKey && line.trim()) {
      fields[currentKey] = `${fields[currentKey]} ${line.trim()}`.trim()
    }
  }

  return fields
}

const checkSkill = async (name) => {
  const relativePath = `${SKILLS_DIR}/${name}/SKILL.md`
  let content

  try {
    content = await readFile(path.join(root, relativePath), "utf8")
  } catch {
    report(`${SKILLS_DIR}/${name}`, "missing SKILL.md")
    return
  }

  const frontmatter = parseFrontmatter(content)

  if (!frontmatter) {
    report(relativePath, "missing or malformed YAML frontmatter (--- block)")
    return
  }

  if (!frontmatter.name) {
    report(relativePath, "frontmatter is missing a `name`")
  } else if (frontmatter.name !== name) {
    report(
      relativePath,
      `frontmatter name "${frontmatter.name}" does not match directory "${name}"`,
    )
  }

  const folded = frontmatter.description?.replace(FOLD_MARKER, "").trim()

  if (!folded) {
    report(relativePath, "frontmatter is missing a `description`")
  }
}

const findDanglingSymlinks = async (dir) => {
  let entries

  try {
    entries = await readdir(path.join(root, dir), { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const relativePath = `${dir}/${entry.name}`

    if (entry.isSymbolicLink()) {
      try {
        await stat(path.join(root, relativePath))
      } catch {
        report(relativePath, "dangling symlink (target does not exist)")
      }
      continue
    }

    if (entry.isDirectory()) {
      await findDanglingSymlinks(relativePath)
    }
  }
}

const main = async () => {
  const entries = await readdir(path.join(root, SKILLS_DIR), {
    withFileTypes: true,
  })
  const skills = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  for (const name of skills) {
    await checkSkill(name)
  }

  for (const dir of SYMLINK_ROOTS) {
    await findDanglingSymlinks(dir)
  }

  // The routing table is how an agent finds a skill; a skill absent from it is
  // effectively invisible, and a row pointing at a deleted skill is a dead end.
  const routing = await readFile(path.join(root, ROUTING_TABLE), "utf8")
  const referenced = new Set(
    [...routing.matchAll(TABLE_SKILL_CELL)].map((match) => match[1]),
  )

  for (const name of skills) {
    if (!referenced.has(name)) {
      report(
        ROUTING_TABLE,
        `skill "${name}" exists but is missing from the "Skill → task mapping" table`,
      )
    }
  }

  for (const name of referenced) {
    if (!skills.includes(name)) {
      report(
        ROUTING_TABLE,
        `table references "${name}", which is not a directory in ${SKILLS_DIR}`,
      )
    }
  }

  if (violations.length > 0) {
    console.error(`Skill validation failed (${violations.length} problem(s)):`)

    for (const { file, message } of violations) {
      console.error(`  ${file}: ${message}`)
    }

    process.exit(1)
  }

  console.log(`Checked ${skills.length} skills in ${SKILLS_DIR} — all valid`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
