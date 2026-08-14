import {
  type AppointmentSchedulingStepSchema,
  appointmentSchedulingStepDefaultFn,
  appointmentSchedulingStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { AppointmentSchedulingStepEditor } from "./editor"
import { AppointmentSchedulingStepViewer } from "./viewer"

export const appointmentSchedulingStep: StepDefinition<AppointmentSchedulingStepSchema> =
  {
    editor: AppointmentSchedulingStepEditor,
    viewer: AppointmentSchedulingStepViewer,
    validator: appointmentSchedulingStepSchema,
    defaultFn: appointmentSchedulingStepDefaultFn,
  }
