"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

// Client button that opens a file picker, uploads the CSV to
// /api/affiliate-portal/conversions/import, and surfaces the result inline
// so the founder sees what landed (new members, matched orders, etc.) and
// what was skipped.
//
// On success it calls router.refresh() so the conversions table on the page
// repaints with the newly imported rows.

interface ImportResult {
  totalRows: number;
  parsedRows: number;
  attributionsCreated: number;
  attributionsUpdated: number;
  membersCreated: number;
  membersUpdated: number;
  ordersMatched: number;
  ordersUnmatched: number;
  skipped: number;
  warnings: string[];
}

export function UploadConversionsCsvButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/affiliate-portal/conversions/import", {
        method: "POST",
        body: form
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? "Upload failed.");
      }
      setResult(body.result as ImportResult);
      // Refresh the server-rendered conversions table on the page.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold shadow-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        {uploading ? "Importing…" : "Upload CSV"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={onChange}
      />

      {result ? (
        <div className="mt-1 max-w-[420px] rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {fileName ?? "CSV"} imported
          </p>
          <p className="mt-1">
            {result.parsedRows} of {result.totalRows} rows parsed ·{" "}
            <strong>{result.attributionsCreated}</strong> new + <strong>{result.attributionsUpdated}</strong> updated
            attributions
          </p>
          <p>
            <strong>{result.membersCreated}</strong> new affiliates · <strong>{result.ordersMatched}</strong> matched to
            Shopify orders · <strong>{result.ordersUnmatched}</strong> unmatched
            {result.skipped > 0 ? ` · ${result.skipped} skipped` : ""}
          </p>
          {result.warnings.length > 0 ? (
            <p className="mt-1 text-amber-800">
              {result.warnings.map((w, i) => (
                <span key={i} className="block">
                  ⚠ {w}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-1 max-w-[420px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Import failed
          </p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
