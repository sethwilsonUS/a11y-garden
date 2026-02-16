"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AuditCard } from "@/components/AuditCard";
import { ScanForm } from "@/components/ScanForm";

function SeedlingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22V12" />
      <path d="M12 12C12 8 8 6 4 6c0 4 2 8 8 6" />
      <path d="M12 12c0-4 4-6 8-6-0 4-2 8-8 6" />
    </svg>
  );
}

export default function HomePage() {
  const recentAudits = useQuery(api.audits.getRecentAudits, { limit: 6 });

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 animated-gradient" />
        <div className="absolute inset-0 pattern-leaves opacity-40" />

        <div className="relative container mx-auto px-4 py-16 lg:py-20">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] text-accent text-sm font-medium mb-8 animate-fade-in-up">
              <SeedlingIcon className="w-4 h-4" />
              Automated WCAG 2.2 Checks
            </div>

            <h1 className="text-5xl lg:text-7xl font-display font-semibold text-theme-primary mb-6 leading-tight animate-fade-in-up animate-fade-in-up-delay-1">
              Cultivate a More{" "}
              <span className="text-accent">
                Accessible
              </span>{" "}
              Web
            </h1>

            <p className="text-xl text-theme-secondary mb-12 max-w-2xl mx-auto leading-relaxed animate-fade-in-up animate-fade-in-up-delay-2">
              Scan any website for accessibility issues, then watch your improvements
              grow. Get AI-powered insights to nurture WCAG compliance.
            </p>

            {/* Scan Form */}
            <div className="max-w-2xl mx-auto garden-bed p-6 lg:p-8 shadow-lg animate-fade-in-up animate-fade-in-up-delay-3">
              <ScanForm />
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-semibold text-theme-primary mb-4">
            How It Works
          </h2>
          <p className="text-theme-secondary max-w-2xl mx-auto">
            Three simple steps to help your website flourish
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {[
            {
              step: "1",
              title: "Plant a URL",
              description: "Paste any publicly accessible website URL to begin your accessibility audit.",
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              ),
            },
            {
              step: "2",
              title: "Watch It Grow",
              description: "Our scanner runs axe-core tests, checking against WCAG 2.2 guidelines.",
              icon: (
                <SeedlingIcon className="w-5 h-5" />
              ),
            },
            {
              step: "3",
              title: "Harvest Insights",
              description: "Get plain-English explanations and prioritized recommendations to improve.",
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              ),
            },
          ].map((item) => (
            <div
              key={item.step}
              className="relative garden-bed p-6 group"
            >
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-xl bg-[var(--btn-primary-bg)] flex items-center justify-center text-xl font-display font-bold text-white shadow-md">
                {item.step}
              </div>
              <div className="pt-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-accent">{item.icon}</span>
                  <h3 className="text-xl font-display font-semibold text-theme-primary">
                    {item.title}
                  </h3>
                </div>
                <p className="text-theme-secondary leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Audits */}
      <section className="container mx-auto px-4 py-20">
        <hr className="garden-divider" />
        <div className="flex items-center justify-between mb-8 mt-8">
          <div>
            <h2 className="text-2xl font-display font-semibold text-theme-primary">
              Recent Scans
            </h2>
            <p className="text-theme-secondary mt-1">
              The latest from the community garden
            </p>
          </div>
          <Link
            href="/database"
            className="text-accent hover:underline font-medium flex items-center gap-2 transition-colors"
          >
            View All
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {recentAudits === undefined ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-2xl skeleton" />
            ))}
          </div>
        ) : recentAudits.length === 0 ? (
          <div className="text-center py-12 text-theme-muted">
            <SeedlingIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No seeds planted yet. Be the first to scan a website!</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentAudits.map((audit) => (
              <AuditCard key={audit._id} audit={audit} />
            ))}
          </div>
        )}
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-[var(--accent-bg)] border border-[var(--accent-border)] p-12 lg:p-16">
          <div className="absolute inset-0 pattern-leaves opacity-30" />
          <div className="relative text-center max-w-2xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-display font-semibold text-theme-primary mb-4">
              Explore the Community Garden
            </h2>
            <p className="text-lg text-theme-secondary mb-8 leading-relaxed">
              Browse accessibility audits shared by the community. Learn from
              others and see how different websites are growing.
            </p>
            <Link href="/database" className="btn-primary text-lg px-8 py-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              Browse Public Audits
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
