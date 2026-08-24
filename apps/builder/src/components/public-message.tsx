type PublicMessageProps = {
  title: string
  description: string
}

export function PublicMessage({ title, description }: PublicMessageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  )
}
