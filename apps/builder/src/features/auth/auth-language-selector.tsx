import { LangSelector } from "@/components/lang-selector"

/**
 * Language picker for the main sign-in / sign-up screens. Renders in normal
 * flow as the last item of the auth column, so it sits centered under the
 * form and its terms footer.
 */
export const AuthLanguageSelector = () => (
  <div className="flex justify-center">
    <LangSelector className="bg-transparent" compact />
  </div>
)
