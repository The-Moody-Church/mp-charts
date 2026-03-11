"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MemberStatusGroup } from "@/lib/dto";

interface MemberTabsProps {
  groups: MemberStatusGroup[];
  activeTab: string;
}

export function MemberTabs({ groups, activeTab }: MemberTabsProps) {
  return (
    <TabsList className="w-full sm:w-fit h-auto flex-wrap">
      {groups.map((group) => (
        <TabsTrigger
          key={group.key}
          value={group.key}
          className={`flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5 ${
            activeTab === group.key ? "" : ""
          }`}
        >
          {group.label}
          <span className="ml-1 text-xs opacity-70">({group.count})</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
