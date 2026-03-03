import type { ReactNode } from "react";

interface ButtonCardProps {
  children: ReactNode;
  helperText?: string;
}

export function ButtonCard({ children, helperText }: ButtonCardProps) {
  return (
    <div className="flex flex-col gap-1.5 overflow-hidden">
      {children}
      {helperText && (
        <p className="text-xs text-theme-muted">{helperText}</p>
      )}
    </div>
  );
}
