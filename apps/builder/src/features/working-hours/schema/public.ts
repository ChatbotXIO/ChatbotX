import { publicListResponse } from "@/lib/public-api/list"
import { workingHoursResource } from "./resource"

export const publicListWorkingHoursResponse =
  publicListResponse(workingHoursResource)
