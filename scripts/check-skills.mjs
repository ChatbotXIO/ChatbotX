import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

/**
 * Validates `.agents/skills/` (the runbooks AI agents load before writing code) and
 * `skills/` (packages published externally to skills.sh and ClawHub).
 *
 * Nothing else in the repo checks these files, so a malformed skill (bad
 * frontmatter, a directory/name mismatch, a dangling symlink, or a skill missing
 * from the CLAUDE.md routing table) used to ship silently and stay undiscoverable.
 * For `skills/`, this also guards two registry-specific footguns that fail
 * silently instead of erroring: a root-level `SKILL.md` shadows every package
 * under `skills/` in `npx skills add <repo> --list`, and ClawHub does not
 * support a top-level `license` field or a `metadata.openclaw.homepage`/`emoji`
 * (those two are top-level fields, not nested under `metadata`).
 */

const root = process.cwd()
const SKILLS_DIR = ".agents/skills"
const PUBLISHED_SKILLS_DIR = "skills"
const ROOT_SKILL_FILE = "SKILL.md"
const ROUTING_TABLE = "CLAUDE.md"
const SYMLINK_ROOTS = [".agents", ".claude", ".cursor"]
const MAX_PUBLISHED_DESCRIPTION_LENGTH = 160
const SEMVER = /^\d+\.\d+\.\d+$/
const MISPLACED_METADATA_FIELD = /(?:^|\s)(license|homepage|emoji):/

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

const checkSkill = async (skillsDir, name, { published = false } = {}) => {
  const relativePath = `${skillsDir}/${name}/SKILL.md`
  let content

  try {
    content = await readFile(path.join(root, relativePath), "utf8")
  } catch {
    report(`${skillsDir}/${name}`, "missing SKILL.md")
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

  if (!published) {
    return
  }

  // Registries (skills.sh, ClawHub) hold `skills/*` to a stricter contract
  // than the internal `.agents/skills/` runbooks.
  if (folded && folded.length > MAX_PUBLISHED_DESCRIPTION_LENGTH) {
    report(
      relativePath,
      `\`description\` is ${folded.length} chars — keep published skill descriptions ` +
        `to ${MAX_PUBLISHED_DESCRIPTION_LENGTH} chars or fewer`,
    )
  }

  if (!frontmatter.version) {
    report(relativePath, "frontmatter is missing a `version`")
  } else if (!SEMVER.test(frontmatter.version)) {
    report(
      relativePath,
      `frontmatter \`version\` "${frontmatter.version}" is not semver (X.Y.Z)`,
    )
  }

  if (frontmatter.license !== undefined) {
    report(
      relativePath,
      "frontmatter has a top-level `license` — ClawHub does not support this field " +
        "(every published skill is MIT-0 unconditionally); remove it",
    )
  }

  if (
    frontmatter.metadata &&
    MISPLACED_METADATA_FIELD.test(frontmatter.metadata)
  ) {
    const [, field] = MISPLACED_METADATA_FIELD.exec(frontmatter.metadata)
    report(
      relativePath,
      `\`${field}\` is nested under \`metadata\` — it must be a top-level frontmatter field`,
    )
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

const listSkillDirs = async (dir) => {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

const main = async () => {
  const skills = await listSkillDirs(SKILLS_DIR)

  for (const name of skills) {
    await checkSkill(SKILLS_DIR, name)
  }

  const publishedSkills = await listSkillDirs(PUBLISHED_SKILLS_DIR)

  for (const name of publishedSkills) {
    await checkSkill(PUBLISHED_SKILLS_DIR, name, { published: true })
  }

  // A root-level `SKILL.md` shadows everything under `skills/` in `npx skills`
  // discovery ("A SKILL.md discovered at a shallower level shadows anything
  // nested below it") — verified empirically against this repo. Never add one
  // back; see skills/README.md.
  try {
    await stat(path.join(root, ROOT_SKILL_FILE))
    report(
      ROOT_SKILL_FILE,
      "a root-level SKILL.md shadows every skill under `skills/` in `npx skills` " +
        "discovery — publish skills only under `skills/<name>/SKILL.md` (see skills/README.md)",
    )
  } catch {
    // No root SKILL.md — expected.
  }

  const duplicateNames = skills.filter((name) => publishedSkills.includes(name))

  for (const name of duplicateNames) {
    report(
      `${SKILLS_DIR}/${name}`,
      `skill name "${name}" collides with a published skill at ${PUBLISHED_SKILLS_DIR}/${name}`,
    )
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

  console.log(
    `Checked ${skills.length} skills in ${SKILLS_DIR} and ` +
      `${publishedSkills.length} published skills in ${PUBLISHED_SKILLS_DIR} — all valid`,
  )
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
