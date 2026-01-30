"use client";

/**
 * Temporary page to test the ErrorBoundary UI.
 * Visit /test-error to trigger it.
 * DELETE THIS FILE when you're done testing.
 */

import { useState } from "react";

function BoomComponent() {
  throw new Error("This is a test error to preview the ErrorBoundary UI.");
  return null; // unreachable, keeps TS happy
}

export default function TestErrorPage() {
  const [shouldCrash, setShouldCrash] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-theme-muted text-sm">
        Click the button below to trigger a rendering error.
      </p>
      <button onClick={() => setShouldCrash(true)} className="btn-primary">
        💥 Trigger Error
      </button>
      {shouldCrash && <BoomComponent />}
    </div>
  );
}
