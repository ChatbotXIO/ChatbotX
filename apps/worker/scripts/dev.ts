import concurrently from "concurrently"
import { workers } from "../src/workers"

const commands = workers.map((w) => ({
  name: w.id,
  command: `tsx --watch ${w.entry}`,
}))

const { result } = concurrently(commands, {
  prefix: "name",
  prefixColors: "auto",
  killOthers: ["failure"],
})

result.catch(() => {
  process.exit(1)
})
