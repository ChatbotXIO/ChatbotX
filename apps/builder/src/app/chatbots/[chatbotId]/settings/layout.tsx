import SettingTabs from "@/features/settings/setting-tabs";

export default function SettingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tabs = [
    { value: "general", label: "General", path: "/chatbots/1/settings/general" },
    { value: "channels", label: "Channels", path: "/chatbots/1/settings/channels" },
  ];

  return (
    <div className="px-16 bg-gray-50">
      <SettingTabs tabs={tabs} />
      <div className="">{children}</div>
    </div>
  );
}
