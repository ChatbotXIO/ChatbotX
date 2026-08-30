import { integrationWhatsappCoexistAPIs } from "./coexist"
import { integrationWhatsappOnboardingAPIs } from "./onboarding"
import { integrationWhatsappInternalAPIs } from "./private"

export const integrationWhatsappAPIs = {
  ...integrationWhatsappInternalAPIs,
  ...integrationWhatsappCoexistAPIs,
  ...integrationWhatsappOnboardingAPIs,
}
