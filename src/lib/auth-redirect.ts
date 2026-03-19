"use client";

import { usePathname } from "next/navigation";

function readCurrentSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

export function useAuthRedirectUrl() {
  const pathname = usePathname();
  const search = readCurrentSearch();

  return search ? `${pathname}${search}` : pathname;
}
