import type { ReactNode } from "react"

type SettingsSectionProps = {
  title: string
  description?: ReactNode
  /** Controls aligned to the end of the heading row. */
  actions?: ReactNode
  children: ReactNode
}

/** Full-width flush section: a heading with a one-line description, and its content. */
export const SettingsSection = ({
  title,
  description,
  actions,
  children,
}: SettingsSectionProps) => (
  <section className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 max-w-prose flex-col gap-0.5">
        <h3 className="font-semibold text-base">{title}</h3>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
    {children}
  </section>
)
