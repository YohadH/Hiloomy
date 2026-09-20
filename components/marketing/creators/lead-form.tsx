"use client";

import { useState, type FormEvent } from "react";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

const CTA = "בואו נראה איך זה יעבוד אצלכם";

export function LeadForm() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/creators/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "משהו השתבש. אפשר לנסות שוב או לכתוב לנו במייל." });
        return;
      }
      setState({ kind: "sent" });
      form.reset();
    } catch {
      setState({ kind: "error", message: "אין חיבור לשרת כרגע. נסו שוב בעוד רגע." });
    }
  }

  if (state.kind === "sent") {
    return (
      <div className="cr-form-done" role="status">
        <p className="cr-form-done-title">קיבלנו. נחזור אליכם תוך יום עסקים.</p>
        <p className="cr-form-done-text">נעבור יחד על איך אתם מנהלים היום את המשפיענים, ונראה איך זה נראה בתוך Hiloomy.</p>
      </div>
    );
  }

  return (
    <form className="cr-form" onSubmit={onSubmit} noValidate>
      <div className="cr-form-grid">
        <label className="cr-field">
          <span>שם</span>
          <input name="name" type="text" autoComplete="name" required maxLength={120} />
        </label>
        <label className="cr-field">
          <span>שם המותג</span>
          <input name="brand" type="text" autoComplete="organization" required maxLength={120} />
        </label>
        <label className="cr-field">
          <span>טלפון</span>
          <input name="phone" type="tel" autoComplete="tel" maxLength={40} dir="ltr" />
        </label>
        <label className="cr-field">
          <span>אימייל</span>
          <input name="email" type="email" autoComplete="email" required maxLength={160} dir="ltr" />
        </label>
        <label className="cr-field">
          <span>כתובת האתר</span>
          <input name="site" type="text" inputMode="url" autoComplete="url" maxLength={200} dir="ltr" />
        </label>
        <label className="cr-field">
          <span>כמה משפיענים עובדים איתכם היום?</span>
          <select name="creators" required defaultValue="">
            <option value="" disabled>
              בחרו
            </option>
            <option value="1-4">1–4</option>
            <option value="5-9">5–9</option>
            <option value="10-24">10–24</option>
            <option value="25-49">25–49</option>
            <option value="50+">50+</option>
          </select>
        </label>
        {/* Hidden anti-bot field. Real people never see or fill it. */}
        <label className="cr-hp" aria-hidden="true">
          <span>website</span>
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.kind === "error" ? (
        <p className="cr-form-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="cr-form-foot">
        <button type="submit" className="cr-btn cr-btn-primary cr-btn-lg" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? "שולחים…" : CTA}
        </button>
      </div>
    </form>
  );
}
