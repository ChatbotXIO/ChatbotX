export const SpacingBlockEditor = ({
  parentName,
  ...rest
}: {
  parentName: string
}) => {
  return (
    <div className="w-full flex-1" {...rest}>
      <div className="h-10" />
    </div>
  )
}
