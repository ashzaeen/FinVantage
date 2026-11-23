import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ViewerProvider } from "@/components/ui/ViewerProvider";
import { TOKEN_COOKIE } from "@/lib/token";
import { isDemoViewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** Tints the phone's status bar and browser chrome to match the dashboard's top bar. */
export const viewport: Viewport = {
  themeColor: "#544af7", // theme-ok: ThemeProvider swaps it for the dark chrome color
};

// Dashboard pages show live API data, so never prerender them at build time.
export const dynamic = "force-dynamic";

/** Every signed-in page. The group adds the sidebar without changing any URL. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const isDemo = isDemoViewer((await cookies()).get(TOKEN_COOKIE)?.value);
  return (
    <ViewerProvider isDemo={isDemo}>
      <AppShell>{children}</AppShell>
    </ViewerProvider>
  );
}
