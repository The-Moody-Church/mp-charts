"use client";

import { useMemo } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { HomeIcon, UsersIcon, UserGroupIcon, ChartBarIcon, ShieldCheckIcon, MapIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import { useAuthorization } from "@/hooks/use-authorization";
import { useUser } from "@/contexts/user-context";
import type { Feature } from "@/lib/authorization";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  feature?: Feature;
  adminOnly?: boolean;
}

const navigation: NavItem[] = [
  { name: "Home", href: "/", icon: HomeIcon },
  { name: "Dashboard: Journey of a Lifetime", href: "/dashboard", icon: ChartBarIcon, feature: "dashboard" },
  { name: "Contact Lookup", href: "/contact-lookup", icon: UsersIcon, feature: "contact-lookup" },
  { name: "Manage Members", href: "/manage-members", icon: UserGroupIcon, feature: "manage-members" },
  { name: "Setup", href: "/admin", icon: ShieldCheckIcon, adminOnly: true },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { canAccess, isSuperAdmin } = useAuthorization();
  const { journeyTools, complianceTools } = useUser();

  const visibleItems = useMemo(() => {
    const journeyNavItems: NavItem[] = journeyTools.map((tool) => ({
      name: tool.name,
      href: `/journey/${tool.slug}`,
      icon: MapIcon,
      feature: `journey:${tool.slug}` as Feature,
    }));

    const complianceNavItems: NavItem[] = complianceTools.map((tool) => ({
      name: tool.name,
      href: `/compliance/${tool.slug}`,
      icon: CheckBadgeIcon,
      feature: `compliance:${tool.slug}` as Feature,
    }));

    const setupIndex = navigation.findIndex((item) => item.adminOnly);
    const allItems = [
      ...navigation.slice(0, setupIndex >= 0 ? setupIndex : navigation.length),
      ...journeyNavItems,
      ...complianceNavItems,
      ...(setupIndex >= 0 ? navigation.slice(setupIndex) : []),
    ];

    return allItems.filter((item) => {
      if (item.adminOnly && !isSuperAdmin) return false;
      if (item.feature && !canAccess(item.feature)) return false;
      return true;
    });
  }, [journeyTools, complianceTools, canAccess, isSuperAdmin]);

  return (
    <div
      className={`fixed top-0 left-0 z-50 h-full w-64 bg-[#344767] shadow-lg transform transition-transform duration-300 ease-in-out ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-[#2d3a5f]">
        <h2 className="text-lg font-semibold text-white">Menu</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-md text-white hover:text-gray-200 hover:bg-[#2d3a5f]"
          aria-label="Close menu"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      <nav className="mt-4">
        <ul className="space-y-1 px-2">
          {visibleItems.map((item) => (
            <li key={item.name}>
              <a
                href={item.href}
                className="flex items-center px-3 py-2 text-sm font-medium text-white rounded-md hover:bg-[#2d3a5f] hover:text-gray-200"
                onClick={onClose}
              >
                <item.icon className="mr-3 h-5 w-5 text-white" />
                {item.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
