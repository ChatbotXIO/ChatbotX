import { publicListResponse } from "@/lib/public-api/list"
import { workingHoursHolidayResource, workingHoursResource } from "./resource"

export const publicListWorkingHoursResponse =
  publicListResponse(workingHoursResource)

export const publicListHolidaysResponse = publicListResponse(
  workingHoursHolidayResource,
)
