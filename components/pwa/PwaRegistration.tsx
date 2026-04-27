"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (process.env.NODE_ENV === "development") {
          console.log("[PWA] Service worker registered, scope:", registration.scope);
        }
      } catch {
        return;
      }
    };

    void register();
  }, []);

  return null;
}
