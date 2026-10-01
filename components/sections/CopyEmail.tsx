"use client";

import { useRef, useState } from "react";

/** The address as the page's loudest element. Click to copy; a real mailto link sits beside it. */
export default function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      // clipboard API unavailable (insecure context): select-and-copy fallback
      const ta = document.createElement("textarea");
      ta.value = email;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2400);
  };

  return (
    <div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy email address ${email}`}
        data-cursor="view"
        data-cursor-label="Copy"
        className="group block max-w-full text-left"
      >
        <span className="label mb-4 flex items-center gap-3">
          Email <span aria-hidden="true">—</span> click to copy
        </span>
        <span className="h-display link block max-w-full overflow-hidden text-ellipsis text-[clamp(1.2rem,4.4vw,4.6rem)] normal-case !leading-[1.05] tracking-[-0.03em]">
          {email}
        </span>
      </button>
      <p className="label mt-4 h-4 !text-laser" role="status" aria-live="polite">
        {copied ? "Copied to clipboard ✓" : ""}
      </p>
    </div>
  );
}
