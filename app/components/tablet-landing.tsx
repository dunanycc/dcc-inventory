"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isMobileClient } from "@/lib/mobile-landing";
export function TabletLanding() {
  const router = useRouter();
  useEffect(() => {
    router.replace(
      isMobileClient(navigator.userAgent, navigator.maxTouchPoints)
        ? "/mobile"
        : "/inventory",
    );
  }, [router]);
  return <p>Opening workspace…</p>;
}
