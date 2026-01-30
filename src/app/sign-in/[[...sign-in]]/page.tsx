import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="absolute inset-0 animated-gradient -z-10" />
      <div className="absolute inset-0 pattern-leaves opacity-20 -z-10" />
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl",
            headerTitle: "text-[var(--text-primary)] font-display",
            headerSubtitle: "text-[var(--text-secondary)]",
            socialButtonsBlockButton:
              "bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)]",
            socialButtonsBlockButtonText: "text-[var(--text-primary)]",
            dividerLine: "bg-[var(--border-color)]",
            dividerText: "text-[var(--text-muted)]",
            formFieldLabel: "text-[var(--text-secondary)]",
            formFieldInput:
              "bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)]",
            formButtonPrimary:
              "bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white",
            footerActionLink: "text-[var(--accent)] hover:opacity-80",
            identityPreviewText: "text-[var(--text-primary)]",
            identityPreviewEditButton: "text-[var(--accent)]",
          },
        }}
      />
    </div>
  );
}
