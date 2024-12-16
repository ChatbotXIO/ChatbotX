"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import { useTranslate } from "@tolgee/react";

type settingTabs = {
  value: string,
  label: any,
  path: string,
}

const SettingTabs = () => {

  const { t } = useTranslate()

  const pathname = usePathname();

  const tabs: settingTabs[] = [
    { value: "general", label: t('common.general', 'General'), path: "/chatbots/1/settings/general" },
    { value: "channels", label: t('common.channels', 'Channels'), path: "/chatbots/1/settings/channels" },
    { value: "integrations", label: t('common.integraions', 'Integrations'), path: "/chatbots/1/settings/integrations" },
    
  ];

  const activeTab =
    tabs.find((tab) => pathname.includes(tab.path))?.value || "general";

  return (
    <Tabs value={activeTab} className="w-full">
      <TabsList className="">
        {tabs.map((tab) => (
          <Link href={tab.path} passHref key={tab.value}>
            <TabsTrigger value={tab.value}>{tab.label}</TabsTrigger>
          </Link>
        ))}
      </TabsList>
    </Tabs>
  );
};

export default SettingTabs;
