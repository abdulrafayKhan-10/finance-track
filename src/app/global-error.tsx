"use client";

/** Last-resort error page. Shows no error details: they could contain financial data. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>Your data has not been changed by this error.</p>
        <button type="button" onClick={reset} style={{ padding: "0.5rem 1rem", marginTop: "1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
