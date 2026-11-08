import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Dashboard pages show live API data, so never prerender them at build time.
export const dynamic = "force-dynamic";

/** Every signed-in page. The group adds the sidebar without changing any URL. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
