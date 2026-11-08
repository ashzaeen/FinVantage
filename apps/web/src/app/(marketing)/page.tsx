import type { Metadata } from "next";
import { CopilotSection } from "@/components/landing/CopilotSection";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TrustSection } from "@/components/landing/TrustSection";

export const metadata: Metadata = {
  title: { absolute: "FinVantage: Know What a Purchase Does to Your Goals, Before You Buy" },
  description: "FinVantage brings your accounts, cash flow, and goals together so you can understand the trade-offs behind your next financial decision.",
};

/** Public landing page composed from server-rendered marketing sections. */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <FeatureGrid />
        <CopilotSection />
        <TrustSection />
      </main>
      <Footer />
    </div>
  );
}
