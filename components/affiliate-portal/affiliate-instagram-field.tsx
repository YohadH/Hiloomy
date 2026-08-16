"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AffiliateInstagramField({
  affiliateId,
  storeId,
  initialValue
}: {
  affiliateId: string;
  storeId: string;
  initialValue?: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isDirty = value.trim() !== (initialValue ?? "").trim();

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/affiliate-portal/affiliates/${affiliateId}/instagram`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            instagramProfileUrl: value
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not save Instagram profile.");
        }
        setValue(payload.instagramProfileUrl ?? "");
        setMessage("Saved");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save");
      }
    });
  }

  return (
    <div className="min-w-64 space-y-2">
      <input
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setMessage(null);
        }}
        placeholder="@handle or profile URL"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={save} disabled={isPending || !isDirty}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        {initialValue ? (
          <a href={initialValue} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
            Open
          </a>
        ) : null}
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  );
}
