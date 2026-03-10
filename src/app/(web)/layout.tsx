import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/app/providers";
import { AuthWrapper, Header, DynamicBreadcrumb, BreadcrumbOverrideProvider } from "@/components/layout";
import { FeedbackWrapper } from "@/components/feedback";
import { InstallPrompt } from "@/components/pwa";
import type { RuntimeConfig } from "@/contexts";

export const metadata: Metadata = {
  title: "MP Tools",
  description: "Ministry Platform Tools",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/assets/icons/favicon.ico", sizes: "32x32" },
      { url: "/assets/icons/mp-tools-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/assets/icons/mp-tools-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/assets/icons/mp-tools-ios-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MP Tools",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#73253E",
}

export default function WebLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read NEXT_PUBLIC_* vars server-side so they're available at runtime
  // (client components can't read process.env in standalone Docker builds)
  const runtimeConfig: RuntimeConfig = {
    mpFileUrl: process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL || null,
    appName: process.env.NEXT_PUBLIC_APP_NAME || "MP Tools",
  };

  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <AuthWrapper>
        <Providers runtimeConfig={runtimeConfig}>
          <BreadcrumbOverrideProvider>
            <div className={`flex flex-col ${GeistSans.variable} ${GeistMono.variable}`}>
              <Header />
              <main className="flex-1 mt-16">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <DynamicBreadcrumb />
                </div>
                {children}
              </main>
            </div>
          </BreadcrumbOverrideProvider>
          <FeedbackWrapper />
          <InstallPrompt />
        </Providers>
      </AuthWrapper>
    </Suspense>
  );
}
