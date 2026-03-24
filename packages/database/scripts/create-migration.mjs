import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const prevSnap = JSON.parse(
  readFileSync(
    "src/drizzle/20260324052638_add_instagram_persistent_menus/snapshot.json",
    "utf8",
  ),
)
const prevId = prevSnap.id
const newId = randomUUID()
const dirName = "20260324060000_rename_fallback_to_welcome_flow_id"
const dirPath = `src/drizzle/${dirName}`

const newSnap = JSON.parse(JSON.stringify(prevSnap))
newSnap.id = newId
newSnap.prevIds = [prevId]

newSnap.ddl = newSnap.ddl.map((d) => {
  // IntegrationMessenger: rename fallbackFlowId column
  if (
    d.entityType === "columns" &&
    d.table === "IntegrationMessenger" &&
    d.name === "fallbackFlowId"
  ) {
    return { ...d, name: "welcomeFlowId" }
  }
  // IntegrationMessenger: rename fallbackFlowId index
  if (
    d.entityType === "indexes" &&
    d.table === "IntegrationMessenger" &&
    d.name === "IntegrationMessenger_fallbackFlowId_idx"
  ) {
    return {
      ...d,
      name: "IntegrationMessenger_welcomeFlowId_idx",
      columns: [{ ...d.columns[0], value: "welcomeFlowId" }],
    }
  }
  // IntegrationMessenger: rename fallbackFlowId FK
  if (
    d.entityType === "fks" &&
    d.table === "IntegrationMessenger" &&
    d.name === "IntegrationMessenger_fallbackFlowId_fkey"
  ) {
    return {
      ...d,
      name: "IntegrationMessenger_welcomeFlowId_fkey",
      columns: ["welcomeFlowId"],
    }
  }
  // IntegrationInstagram: rename fallbackFlowId column
  if (
    d.entityType === "columns" &&
    d.table === "IntegrationInstagram" &&
    d.name === "fallbackFlowId"
  ) {
    return { ...d, name: "welcomeFlowId" }
  }
  // IntegrationInstagram: rename fallbackFlowId index
  if (
    d.entityType === "indexes" &&
    d.table === "IntegrationInstagram" &&
    d.name === "IntegrationInstagram_fallbackFlowId_idx"
  ) {
    return {
      ...d,
      name: "IntegrationInstagram_welcomeFlowId_idx",
      columns: [{ ...d.columns[0], value: "welcomeFlowId" }],
    }
  }
  // IntegrationInstagram: rename fallbackFlowId FK
  if (
    d.entityType === "fks" &&
    d.table === "IntegrationInstagram" &&
    d.name === "IntegrationInstagram_fallbackFlowId_fkey"
  ) {
    return {
      ...d,
      name: "IntegrationInstagram_welcomeFlowId_fkey",
      columns: ["welcomeFlowId"],
    }
  }
  return d
})

// Add new columns for IntegrationMessenger
const newCols = [
  "greetingMessages",
  "persistentMenus",
  "conversationStarters",
  "personas",
].map((name) => ({
  type: "jsonb",
  typeSchema: null,
  notNull: true,
  dimensions: 1,
  default: "'{}'::jsonb[]",
  generated: null,
  identity: null,
  name,
  entityType: "columns",
  schema: "public",
  table: "IntegrationMessenger",
}))
newSnap.ddl.push(...newCols)

mkdirSync(dirPath, { recursive: true })
writeFileSync(`${dirPath}/snapshot.json`, JSON.stringify(newSnap, null, 2))

console.log(`Migration directory: ${dirPath}`)
console.log(`New snapshot ID: ${newId}`)
