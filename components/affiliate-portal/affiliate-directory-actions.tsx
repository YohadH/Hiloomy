"use client";

import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type NoticeTone = "success" | "error" | "info";

const INITIAL_FORM = {
  email: "",
  firstName: "",
  lastName: "",
  country: "",
  source: "Manual",
  status: "approved",
  affiliateCode: "",
  couponCode: "",
  instagramProfileUrl: "",
  programName: ""
};

function getNoticeClasses(tone: NoticeTone) {
  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-border bg-card text-muted-foreground";
}

export function AffiliateDirectoryActions() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateField(field: keyof typeof INITIAL_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(INITIAL_FORM);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleExportClick() {
    window.location.assign("/api/affiliate-portal/affiliates/export?format=csv");
  }

  async function handleImportChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setNotice({ tone: "info", text: `Importing ${file.name}...` });

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/affiliate-portal/affiliates/import", {
          method: "POST",
          body: formData
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Import failed.");
        }

        const counts = `Created ${payload.created}, updated ${payload.updated}, skipped ${payload.skipped}.`;
        const programs = payload.programsCreated
          ? ` Created ${payload.programsCreated} program${payload.programsCreated === 1 ? "" : "s"}.`
          : "";
        const errors = Array.isArray(payload.errors) && payload.errors.length
          ? ` ${payload.errors.slice(0, 3).join(" ")}`
          : "";

        setNotice({
          tone: Array.isArray(payload.errors) && payload.errors.length ? "info" : "success",
          text: `Imported ${file.name}. ${counts}${programs}${errors}`
        });
        router.refresh();
      } catch (error) {
        setNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "Import failed."
        });
      } finally {
        input.value = "";
      }
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/affiliate-portal/affiliates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not save the affiliate.");
        }

        setNotice({
          tone: "success",
          text: payload.created
            ? "Affiliate created successfully."
            : "Affiliate updated successfully."
        });
        resetForm();
        setIsFormOpen(false);
        router.refresh();
      } catch (error) {
        setNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "Could not save the affiliate."
        });
      }
    });
  }

  return (
    <div className="w-full max-w-3xl space-y-3 lg:w-auto">
      <div className="flex flex-wrap gap-3 lg:justify-end">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.json,application/json,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleImportChange}
        />
        <Button type="button" variant="secondary" onClick={handleImportClick} disabled={isPending}>
          {isPending ? "Working..." : "Import"}
        </Button>
        <Button type="button" variant="secondary" onClick={handleExportClick} disabled={isPending}>
          Export
        </Button>
        <Button type="button" onClick={() => setIsFormOpen((value) => !value)} disabled={isPending}>
          {isFormOpen ? "Close form" : "Add affiliate"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground lg:text-end">
        Import supports Excel (.xlsx, .xls), CSV, and JSON files.
      </p>

      {isFormOpen ? (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Email</span>
              <input
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
                type="email"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">First name</span>
              <input
                value={form.firstName}
                onChange={(event) => updateField("firstName", event.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Last name</span>
              <input
                value={form.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Country</span>
              <input
                value={form.country}
                onChange={(event) => updateField("country", event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Source</span>
              <input
                value={form.source}
                onChange={(event) => updateField("source", event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select
                value={form.status}
                onChange={(event) => updateField("status", event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              >
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="denied">Denied</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Affiliate code</span>
              <input
                value={form.affiliateCode}
                onChange={(event) => updateField("affiliateCode", event.target.value)}
                placeholder="Optional"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Coupon code</span>
              <input
                value={form.couponCode}
                onChange={(event) => updateField("couponCode", event.target.value)}
                placeholder="Optional"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Instagram profile</span>
              <input
                value={form.instagramProfileUrl}
                onChange={(event) => updateField("instagramProfileUrl", event.target.value)}
                placeholder="@handle or https://www.instagram.com/handle/"
                className="w-full rounded-xl border border-border bg-background px-4 py-3"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Program name</span>
            <input
              value={form.programName}
              onChange={(event) => updateField("programName", event.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-border bg-background px-4 py-3"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save affiliate"}
            </Button>
            <Button type="button" variant="ghost" onClick={resetForm} disabled={isPending}>
              Reset
            </Button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${getNoticeClasses(notice.tone)}`}>
          {notice.text}
        </div>
      ) : null}
    </div>
  );
}
