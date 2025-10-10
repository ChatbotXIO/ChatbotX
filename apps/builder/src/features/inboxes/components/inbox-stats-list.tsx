import { Card, CardContent } from "@aha.chat/ui/components/ui/card"

export default function InboxStatsList() {
  return (
    <div className="flex flex-wrap gap-4">
      <Card className="w-[200px] py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">Contacts</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="w-[200px] py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">New Contacts</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="w-[200px] py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">Active Contacts</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="w-[200px] py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">Response Time</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="w-[200px] py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">First Response Time</h3>
          <p className="font-bold text-sm">Coming soon</p>
        </CardContent>
      </Card>
    </div>
  )
}
