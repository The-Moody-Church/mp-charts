"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AdminPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Setup</h1>
        <p className="text-muted-foreground mt-1">
          Configure tools and manage feature permissions
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Journey Tools</CardTitle>
            <CardDescription>
              Configure which Ministry Platform journeys are available as processing tools
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Link href="/admin/journey-tools">
              <Button variant="outline">Manage Journey Tools</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Compliance Tools</CardTitle>
            <CardDescription>
              Configure group role compliance requirements as processing tools
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Link href="/admin/compliance-tools">
              <Button variant="outline">Manage Compliance Tools</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Feedback</CardTitle>
            <CardDescription>
              Configure the user feedback feature and Ministry Platform integration
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Link href="/admin/feedback">
              <Button variant="outline">Feedback Settings</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>
              Manage which User Groups can access each feature
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Link href="/admin/permissions">
              <Button variant="outline">Manage Permissions</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
