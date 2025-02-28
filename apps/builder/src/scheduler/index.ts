import { Cron } from "croner"

const _job = new Cron("*/5 * * * * *", () => {
  console.log("This will run every fifth second")
})
