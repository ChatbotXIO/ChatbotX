import { redirect } from "next/navigation"

/**
 * Force a reseller-provisioned user who still holds a temporary password onto
 * the change-password page. Call from every protected layout/page so the gate
 * holds across all authenticated routes — gating only `/` lets a flagged user
 * keep the temp password by navigating straight to `/space/...`, `/admin`, etc.
 *
 * `/auth/change-password` lives under the public `/auth` prefix and self-guards
 * (`!mustChangePassword → /`), so this never loops.
 */
export function enforcePasswordCurrent(user: {
  mustChangePassword?: boolean | null
}): void {
  if (user.mustChangePassword) {
    redirect("/auth/change-password")
  }
}
