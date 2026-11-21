import type { Metadata } from "next";
import { ClosingCta } from "@/components/landing/ClosingCta";
import { CopilotSection } from "@/components/landing/CopilotSection";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProofStrip } from "@/components/landing/ProofStrip";
import { TrustSection } from "@/components/landing/TrustSection";
import { UseCases } from "@/components/landing/UseCases";

export const metadata: Metadata = {
  title: { absolute: "FinVantage: Know What a Purchase Does to Your Goals, Before You Buy" },
  description: "FinVantage brings your accounts, cash flow, and goals together so you can understand the trade-offs behind your next financial decision.",
};

/** Public landing page: one story, top to bottom. Hero, use cases, how it works, the Copilot, proof, trust, then the close. */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main>
        <Hero />
        <UseCases />
        <HowItWorks />
        <CopilotSection />
        <ProofStrip />
        <TrustSection />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}
