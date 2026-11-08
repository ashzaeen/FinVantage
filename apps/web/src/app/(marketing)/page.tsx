import type { Metadata } from "next";
import { LoginForm } from "@/app/login/LoginForm";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { PurchaseTryout } from "@/components/landing/PurchaseTryout";
import { Container, Features, LandingFooter, TryDemoLink } from "@/components/landing/Sections";

export const metadata: Metadata = {
  title: { absolute: "FinVantage: Know What a Purchase Does to Your Goals" },
};

/**
 * The public landing page: the headline with a live purchase tryout, sign-in beside it, then the
 * five headline features. Rows for each feature are planned in docs/landing-page-plan.md.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />
      <main>
        <section className="pb-12 pt-8 md:pb-16 lg:pt-8">
          {/* Three grid items so phones read headline, then sign-in, then the tryout. */}
          <Container className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-x-16 lg:gap-y-6">
            <div className="lg:col-start-1 lg:row-start-1">
              <h1 className="max-w-[24ch] font-poppins text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[34px] lg:text-[38px]">
                Know What a Purchase Does to Your Goals, Before You Buy
              </h1>
            </div>
            <div
              id="sign-in"
              className="scroll-mt-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-[440px] lg:self-center lg:justify-self-end"
            >
              <LoginForm
                embedded
                footer={
                  <div className="mt-4 flex flex-col gap-2 text-center">
                    <p className="text-sm text-muted">Just looking? No account needed.</p>
                    <TryDemoLink />
                  </div>
                }
              />
            </div>
            <div className="lg:col-start-1 lg:row-start-2">
              <PurchaseTryout />
            </div>
          </Container>
        </section>
        <Features />
      </main>
      <LandingFooter />
    </div>
  );
}
