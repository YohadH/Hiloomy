"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Client button that downloads the Meta Ads weekly report as a PDF.
// Triggers POST /api/weekly-summary/export/meta-ads-pdf with the same date
// range the page is displaying, so the PDF matches what's on screen.

interface Props {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  storeId?: string;
  labelDownload: string;
  labelGenerating: string;
  // true → extended report including the diagnostic/deep-dive appendix.
  appendix?: boolean;
}

export function ExportMetaAdsPdfButton({
  from,
  to,
  storeId,
  labelDownload,
  labelGenerating,
  appendix = false
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/weekly-summary/export/meta-ads-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, storeId, appendix })
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Export failed (HTTP ${response.status}).`);
      }
      const blob = await response.blob();

      // Trigger download by creating a temporary anchor. The Content-Disposition
      // header sets the filename, but browsers honour the anchor's `download`
      // attribute when both are present.
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `meta-ads-weekly-${from}_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the browser starts the download (sync on most browsers).
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        className="inline-flex items-center gap-1.5"
        onClick={onClick}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
        {busy ? labelGenerating : labelDownload}
      </Button>
      {error ? (
        <p className="max-w-[220px] text-end text-[11px] text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
