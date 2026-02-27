"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthorization } from "@/hooks/use-authorization";
import type { Feature } from "@/lib/authorization";

interface FeatureCard {
  title: string;
  description: string;
  href: string;
  buttonText: string;
  feature?: Feature;
  adminOnly?: boolean;
}

const featureCards: FeatureCard[] = [
  {
    title: "Executive Dashboard",
    description: "View ministry year metrics including attendance trends, group participation, and year-over-year comparisons",
    href: "/dashboard",
    buttonText: "View Dashboard",
    feature: "dashboard",
  },
  {
    title: "Volunteer Processing",
    description: "Track children\u2019s ministry volunteer onboarding, view requirement checklists, and manage approved volunteers",
    href: "/volunteer-processing",
    buttonText: "View Volunteers",
    feature: "volunteer-processing",
  },
  {
    title: "Baptism Processing",
    description: "Track baptism applicants through the baptism journey, manage milestones, and handle approvals",
    href: "/baptism-processing",
    buttonText: "View Baptisms",
    feature: "baptism-processing",
  },
  {
    title: "Membership Processing",
    description: "Track membership application milestones, manage the approval process, and complete new member registrations",
    href: "/membership-processing",
    buttonText: "View Applicants",
    feature: "membership-processing",
  },
  {
    title: "Contact Lookup",
    description: "Search and view contact records from Ministry Platform",
    href: "/contactlookup",
    buttonText: "View Contacts",
    feature: "contact-lookup",
  },
  {
    title: "Setup",
    description: "Manage which User Groups can access each feature",
    href: "/admin",
    buttonText: "Open Setup",
    adminOnly: true,
  },
];

export function HomeCards() {
  const { canAccess, isSuperAdmin } = useAuthorization();

  const visibleCards = featureCards.filter((card) => {
    if (card.adminOnly && !isSuperAdmin) return false;
    if (card.feature && !canAccess(card.feature)) return false;
    return true;
  });

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {visibleCards.map((card) => (
        <Card key={card.href} className="flex flex-col">
          <CardHeader>
            <CardTitle>{card.title}</CardTitle>
            <CardDescription>{card.description}</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Link href={card.href}>
              <Button className="w-full">{card.buttonText}</Button>
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
