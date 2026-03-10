"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Don't show if previously dismissed
    if (localStorage.getItem(DISMISS_KEY)) return;

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);

    // Only show on iOS Safari or Android Chrome (no native prompt)
    if (isIos) {
      // Only in Safari — other iOS browsers can't install PWAs
      const isSafari = !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua);
      if (isSafari) setPlatform("ios");
    } else if (isAndroid) {
      setPlatform("android");
    }
  }, []);

  useEffect(() => {
    if (platform) {
      // Small delay so it doesn't flash immediately on load
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [platform]);

  function dismiss() {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }

  if (!show || !platform) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md rounded-xl border bg-background p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-medium text-sm">Install MP Tools</p>
            {platform === "ios" ? (
              <p className="text-xs text-muted-foreground mt-1">
                Tap the share button{" "}
                <ShareIcon />
                {" "}then &quot;Add to Home Screen&quot;
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Tap the menu button then &quot;Add to Home Screen&quot; or &quot;Install app&quot;
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      className="inline-block h-4 w-4 align-text-bottom"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
