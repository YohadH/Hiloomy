"use client";

import { useState, type FormEvent } from "react";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

const CTA = "בקשו שיחת היכרות";

// Six fields (owner brief, 22 Sep 2026): full name, brand, site, phone,
// email, creator count. Phone is the required contact channel; email is
// optional and used as reply-to on the notification.
// `cta` is the submit label.
export function LeadForm({ cta = CTA }: { cta?: string }) {
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
      setState({ kind: "error", message: "אין חיבור כרגע. נסו שוב בעוד רגע." });
    }
  }

  if (state.kind === "sent") {
    return (
      <div className="cr-form-done" role="status">
        <p className="cr-form-done-title">קיבלנו. נחזור אליכם תוך יום עסקים.</p>
        <p className="cr-form-done-text">בשיחה נכיר את הפעילות שלכם ונראה איך Hiloomy יכולה להשתלב בה.</p>
      </div>
    );
  }

  return (
    <form className="cr-form" onSubmit={onSubmit} noValidate>
      <div className="cr-form-grid">
        <label className="cr-field">
          <span>שם מלא</span>
          <input name="name" type="text" autoComplete="name" required maxLength={120} />
        </label>
        <label className="cr-field">
          <span>שם המותג</span>
          <input name="brand" type="text" autoComplete="organization" required maxLength={120} />
        </label>
        <label className="cr-field">
          <span>
            כתובת האתר <small>(לא חובה)</small>
          </span>
          <input name="site" type="text" inputMode="url" autoComplete="url" maxLength={200} dir="ltr" />
        </label>
        <label className="cr-field">
          <span>טלפון</span>
          <input name="phone" type="tel" autoComplete="tel" required maxLength={40} dir="ltr" />
        </label>
        <label className="cr-field cr-field-full">
          <span>
            מייל <small>(לא חובה)</small>
          </span>
          <input name="email" type="email" autoComplete="email" maxLength={160} dir="ltr" />
        </label>
        <label className="cr-field cr-field-full">
          <span>עם כמה משפיענים אתם עובדים היום?</span>
          {/* Wrapper carries the CSS chevron (a <select> takes no pseudo-elements). */}
          <span className="cr-select">
            <select name="creators" required defaultValue="">
              <option value="" disabled>
                בחרו
              </option>
              <option value="1-9">1–9</option>
              <option value="10-24">10–24</option>
              <option value="25-49">25–49</option>
              <option value="50-99">50–99</option>
              <option value="100+">100+</option>
            </select>
          </span>
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
          {state.kind === "sending" ? "שולחים…" : cta}
        </button>
      </div>
    </form>
  );
}
