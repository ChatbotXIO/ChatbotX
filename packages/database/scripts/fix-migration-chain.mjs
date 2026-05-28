/**
 * Detects and fixes Drizzle migration prevIds conflicts.
 *
 * Usage:
 *   node scripts/fix-migration-chain.mjs              # check only (exits 1 if issues found)
 *   node scripts/fix-migration-chain.mjs --fix        # preview mutations (no writes)
 *   node scripts/fix-migration-chain.mjs --fix --apply  # write fixes
 *
 * Issue types detected:
 *   sibling_conflict  — multiple migrations share the same parent prevId
 *   duplicate_id      — two migrations have the same snapshot id
 *   missing_parent    — a prevId references a non-existent snapshot
 *   stale_merge       — prevIds=[A,B] where A is already an ancestor of B
 *
 * Exit codes: 0 = clean or applied OK | 1 = issues found | 2 = script error
 */

import { randomUUID } from "node:crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRIZZLE_DIR = join(__dirname, "../drizzle")

const args = process.argv.slice(2)
const MODE = args.includes("--fix") ? "fix" : "check"
const APPLY = args.includes("--apply")

if (APPLY && MODE !== "fix") {
  console.error("[ERROR] --apply requires --fix")
  process.exit(2)
}

// ─── load migrations ─────────────────────────────────────────────────────────

function loadMigrations(dir) {
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const migrations = []
  for (const folder of folders) {
    const snapPath = join(dir, folder, "snapshot.json")
    if (!existsSync(snapPath)) {
      continue
    }
    const raw = JSON.parse(readFileSync(snapPath, "utf8"))
    migrations.push({
      folder,
      path: snapPath,
      id: raw.id,
      prevIds: raw.prevIds ?? [],
      raw,
    })
  }
  return migrations
}

// ─── detection ───────────────────────────────────────────────────────────────

function detect(migrations) {
  const issues = []
  const idToFolder = new Map()
  const duplicateIds = new Map() // id → [folders]

  for (const m of migrations) {
    if (idToFolder.has(m.id)) {
      if (!duplicateIds.has(m.id)) {
        duplicateIds.set(m.id, [idToFolder.get(m.id)])
      }
      duplicateIds.get(m.id).push(m.folder)
    } else {
      idToFolder.set(m.id, m.folder)
    }
  }

  // 1. Duplicate IDs
  for (const [id, folders] of duplicateIds) {
    issues.push({ kind: "duplicate_id", id, folders: [...folders].sort() })
  }

  // 2. Missing parent references
  const allIds = new Set(migrations.map((m) => m.id))
  for (const m of migrations) {
    for (const pid of m.prevIds) {
      if (!allIds.has(pid)) {
        issues.push({
          kind: "missing_parent",
          folder: m.folder,
          missingId: pid,
        })
      }
    }
  }

  // 3. Sibling conflicts — parents with multiple children
  const childrenByParent = new Map()
  for (const m of migrations) {
    for (const pid of m.prevIds) {
      if (!childrenByParent.has(pid)) {
        childrenByParent.set(pid, [])
      }
      childrenByParent.get(pid).push(m.folder)
    }
  }
  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push({
        kind: "sibling_conflict",
        parentId,
        children: [...children].sort(),
      })
    }
  }

  // 4. Stale merges — prevIds=[A,B] where A is already ancestor of B
  const folderById = new Map(migrations.map((m) => [m.id, m.folder]))
  const prevsByFolder = new Map(migrations.map((m) => [m.folder, m.prevIds]))

  function isAncestor(ancestorId, startFolder) {
    const visited = new Set()
    const queue = [startFolder]
    while (queue.length > 0) {
      const cur = queue.shift()
      if (visited.has(cur)) {
        continue
      }
      visited.add(cur)
      for (const pid of prevsByFolder.get(cur) ?? []) {
        if (pid === ancestorId) {
          return true
        }
        const pf = folderById.get(pid)
        if (pf) {
          queue.push(pf)
        }
      }
    }
    return false
  }

  for (const m of migrations) {
    if (m.prevIds.length < 2) {
      continue
    }
    let stale = null
    outer: for (let i = 0; i < m.prevIds.length; i++) {
      for (let j = 0; j < m.prevIds.length; j++) {
        if (i === j) {
          continue
        }
        const pjFolder = folderById.get(m.prevIds[j])
        if (!pjFolder) {
          continue
        }
        if (isAncestor(m.prevIds[i], pjFolder)) {
          stale = { ancestorId: m.prevIds[i], tipId: m.prevIds[j] }
          break outer
        }
      }
    }
    if (stale) {
      issues.push({ kind: "stale_merge", folder: m.folder, ...stale })
    }
  }

  return issues
}

// ─── report ───────────────────────────────────────────────────────────────────

function short(id) {
  return id?.slice(0, 8) ?? "?"
}

function report(issues, migrations) {
  const idToFolder = new Map(migrations.map((m) => [m.id, m.folder]))
  const folderToId = new Map(migrations.map((m) => [m.folder, m.id]))
  const folderList = migrations.map((m) => m.folder)

  issues.forEach((issue, idx) => {
    console.log(`ISSUE ${idx + 1}/${issues.length}: ${issue.kind}`)

    if (issue.kind === "sibling_conflict") {
      const parentFolder = idToFolder.get(issue.parentId) ?? "UNKNOWN"
      console.log(`  Parent: ${short(issue.parentId)} (${parentFolder})`)
      console.log("  Children (same parent):")
      for (let i = 0; i < issue.children.length; i++) {
        const f = issue.children[i]
        const marker = i === 0 ? "" : "   ← needs fix"
        console.log(`    → ${short(folderToId.get(f))}  ${f}${marker}`)
        if (i > 0) {
          const prevSib = issue.children[i - 1]
          console.log(
            `  Fix: set ${f} prevIds to [${short(folderToId.get(prevSib))}]`,
          )
        }
      }
    }

    if (issue.kind === "duplicate_id") {
      console.log(`  id: ${short(issue.id)}`)
      issue.folders.forEach((f, i) => {
        const label = i === 0 ? "(keeps id)" : "← will get new id"
        console.log(
          `  Migration ${String.fromCharCode(65 + i)}: ${f}  ${label}`,
        )
      })
      console.log(
        `  Fix: regenerate id for ${issue.folders.slice(1).join(", ")}`,
      )
    }

    if (issue.kind === "missing_parent") {
      const pos = folderList.indexOf(issue.folder)
      const predecessor = pos > 0 ? folderList[pos - 1] : null
      const predId = predecessor ? folderToId.get(predecessor) : null
      console.log(
        `  ${issue.folder} → prevIds: [${short(issue.missingId)}] (NOT FOUND)`,
      )
      if (predId) {
        console.log(`  Fix: set prevIds to [${short(predId)}] (${predecessor})`)
      } else {
        console.log("  Fix: set prevIds to [] (this is the root migration)")
      }
    }

    if (issue.kind === "stale_merge") {
      const m = migrations.find((x) => x.folder === issue.folder)
      const tipFolder = idToFolder.get(issue.tipId) ?? "?"
      console.log(`  ${issue.folder}`)
      console.log(`    prevIds: [${m.prevIds.map(short).join(", ")}]`)
      console.log(
        `    ${short(issue.ancestorId)} is already ancestor of ${short(issue.tipId)} — merge is redundant`,
      )
      console.log(
        `  Fix: set prevIds to [${short(issue.tipId)}] (${tipFolder})`,
      )
    }

    console.log("")
  })
}

// ─── mutation builder ─────────────────────────────────────────────────────────

function buildMutations(migrations, issues) {
  // Work on mutable copies
  const newId = new Map(migrations.map((m) => [m.folder, m.id]))
  const newPrev = new Map(migrations.map((m) => [m.folder, [...m.prevIds]]))
  const folderList = migrations.map((m) => m.folder)
  const mutations = [] // { folder, field, oldValue, newValue, reason }

  // 1. Duplicate IDs
  for (const issue of issues.filter((i) => i.kind === "duplicate_id")) {
    const [keep, ...rest] = issue.folders // sorted, keep earliest
    for (const dup of rest) {
      const oldId = newId.get(dup)
      const generated = randomUUID()
      newId.set(dup, generated)
      mutations.push({
        folder: dup,
        field: "id",
        oldValue: oldId,
        newValue: generated,
        reason: `duplicate id with ${keep}`,
      })
      // Rewrite any prevIds that referenced the old id
      for (const other of folderList) {
        const pids = newPrev.get(other)
        if (pids.includes(oldId)) {
          const updated = pids.map((p) => (p === oldId ? generated : p))
          mutations.push({
            folder: other,
            field: "prevIds",
            oldValue: [...pids],
            newValue: updated,
            reason: `reference to regenerated id of ${dup}`,
          })
          newPrev.set(other, updated)
        }
      }
    }
  }

  // Helper: rebuild id→folder from current newId state
  const idToFolder = () => new Map(folderList.map((f) => [newId.get(f), f]))

  // 2. Missing parents
  for (const issue of issues.filter((i) => i.kind === "missing_parent")) {
    const pos = folderList.indexOf(issue.folder)
    const predecessor = pos > 0 ? folderList[pos - 1] : null
    const newPrevIds = predecessor ? [newId.get(predecessor)] : []
    const old = [...newPrev.get(issue.folder)]
    newPrev.set(issue.folder, newPrevIds)
    mutations.push({
      folder: issue.folder,
      field: "prevIds",
      oldValue: old,
      newValue: newPrevIds,
      reason: `missing parent ${short(issue.missingId)} → predecessor ${predecessor ?? "none"}`,
    })
  }

  // 3. Sibling conflicts — loop until stable (fixing one conflict can create another)
  let changed = true
  while (changed) {
    changed = false
    const childrenByParent = new Map()
    for (const folder of folderList) {
      for (const pid of newPrev.get(folder)) {
        if (!childrenByParent.has(pid)) {
          childrenByParent.set(pid, [])
        }
        childrenByParent.get(pid).push(folder)
      }
    }
    for (const [, children] of childrenByParent) {
      if (children.length < 2) {
        continue
      }
      const sorted = [...children].sort()
      for (let i = 1; i < sorted.length; i++) {
        const sib = sorted[i]
        const prevSib = sorted[i - 1]
        const prevSibId = newId.get(prevSib)
        const old = [...newPrev.get(sib)]
        if (old.length === 1 && old[0] === prevSibId) {
          continue // already correct
        }
        newPrev.set(sib, [prevSibId])
        mutations.push({
          folder: sib,
          field: "prevIds",
          oldValue: old,
          newValue: [prevSibId],
          reason: `sibling conflict → re-chain after ${prevSib}`,
        })
        changed = true
      }
    }
  }

  // 4. Stale merges (re-detect on current state)
  const prevsByFolder = new Map(folderList.map((f) => [f, newPrev.get(f)]))

  function isAncestor(ancestorId, startFolder) {
    const i2f = idToFolder()
    const visited = new Set()
    const queue = [startFolder]
    while (queue.length > 0) {
      const cur = queue.shift()
      if (visited.has(cur)) {
        continue
      }
      visited.add(cur)
      for (const pid of prevsByFolder.get(cur) ?? []) {
        if (pid === ancestorId) {
          return true
        }
        const pf = i2f.get(pid)
        if (pf) {
          queue.push(pf)
        }
      }
    }
    return false
  }

  for (const folder of folderList) {
    const pids = newPrev.get(folder)
    if (pids.length < 2) {
      continue
    }
    let stale = null
    outer: for (let i = 0; i < pids.length; i++) {
      for (let j = 0; j < pids.length; j++) {
        if (i === j) {
          continue
        }
        const i2f = idToFolder()
        const pjFolder = i2f.get(pids[j])
        if (!pjFolder) {
          continue
        }
        if (isAncestor(pids[i], pjFolder)) {
          stale = { ancestorId: pids[i], tipId: pids[j] }
          break outer
        }
      }
    }
    if (!stale) {
      continue
    }
    const old = [...pids]
    newPrev.set(folder, [stale.tipId])
    mutations.push({
      folder,
      field: "prevIds",
      oldValue: old,
      newValue: [stale.tipId],
      reason: `stale merge — ${short(stale.ancestorId)} is ancestor of ${short(stale.tipId)}`,
    })
  }

  return { mutations, newId, newPrev }
}

// ─── preview ──────────────────────────────────────────────────────────────────

function printMutations(mutations) {
  // Group by folder
  const byFolder = new Map()
  for (const m of mutations) {
    if (!byFolder.has(m.folder)) {
      byFolder.set(m.folder, [])
    }
    byFolder.get(m.folder).push(m)
  }
  for (const [folder, muts] of byFolder) {
    console.log(`  drizzle/${folder}/snapshot.json`)
    for (const m of muts) {
      const oldStr = Array.isArray(m.oldValue)
        ? `[${m.oldValue.map(short).join(", ")}]`
        : short(m.oldValue)
      const newStr = Array.isArray(m.newValue)
        ? `[${m.newValue.map(short).join(", ")}]`
        : short(m.newValue)
      console.log(`    ${m.field}: ${oldStr} → ${newStr}`)
      console.log(`    reason: ${m.reason}`)
    }
    console.log("")
  }
}

// ─── writer ───────────────────────────────────────────────────────────────────

function applyMutations(mutations, newId, newPrev, drizzleDir) {
  const affectedFolders = new Set(mutations.map((m) => m.folder))
  for (const folder of affectedFolders) {
    const snapPath = join(drizzleDir, folder, "snapshot.json")
    const raw = JSON.parse(readFileSync(snapPath, "utf8"))
    raw.id = newId.get(folder)
    raw.prevIds = newPrev.get(folder)
    writeFileSync(snapPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8")
    console.log(`  ✓ ${folder}/snapshot.json`)
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

const migrations = loadMigrations(DRIZZLE_DIR)
console.log(
  `[CHECK] Scanning ${migrations.length} migrations in ${DRIZZLE_DIR}\n`,
)

const issues = detect(migrations)

if (issues.length === 0) {
  console.log("No issues found. Chain is clean.")
  process.exit(0)
}

report(issues, migrations)
console.log(`Summary: ${issues.length} issue(s) found.`)

if (MODE !== "fix") {
  console.log("Run with --fix to preview mutations, --fix --apply to write.")
  process.exit(1)
}

console.log(`\n[FIX ${APPLY ? "APPLY" : "preview"}] Computing mutations...\n`)
const { mutations, newId, newPrev } = buildMutations(migrations, issues)

if (mutations.length === 0) {
  console.log("No mutations needed.")
  process.exit(0)
}

printMutations(mutations)
console.log(
  `Summary: ${mutations.length} mutation(s) across ${new Set(mutations.map((m) => m.folder)).size} file(s).`,
)

if (!APPLY) {
  console.log("\nRe-run with --fix --apply to write changes.")
  process.exit(1)
}

console.log("\n[APPLY] Writing files...")
applyMutations(mutations, newId, newPrev, DRIZZLE_DIR)

console.log("\n[VERIFY] Re-checking chain...")
const fresh = loadMigrations(DRIZZLE_DIR)
const remaining = detect(fresh)
if (remaining.length === 0) {
  console.log("[VERIFY] Clean.")
  process.exit(0)
} else {
  console.log(
    `[VERIFY] ${remaining.length} issue(s) remain — manual review needed:`,
  )
  report(remaining, fresh)
  process.exit(1)
}
