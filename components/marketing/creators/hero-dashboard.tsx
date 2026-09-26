"use client";

import { useEffect, useRef, useState } from "react";

// The hero's product shot, alive: while it's on screen, a new order is
// attributed every few seconds. The row lights up, a "+₪" chip floats off
// the sales figure, and the numbers (row + KPIs) count up. Sample data only;
// it mirrors what the product does with store webhooks. Static under
// prefers-reduced-motion and while the tab is hidden or the shot is off screen.

type Row = {
  initial: string;
  tone: string;
  name: string;
  code: string;
  sales: number;
  orders: number;
  fee: number;
  status: string;
  pill: string;
};

const START: Row[] = [
  { initial: "מ", tone: "", name: "מאיה כהן", code: "MAYA15", sales: 18430, orders: 73, fee: 1843, status: "מאושר לתשלום", pill: "ok" },
  { initial: "נ", tone: "b", name: "נועה לוי", code: "NOA10", sales: 14120, orders: 52, fee: 1412, status: "ממתין לאישור", pill: "wait" },
  { initial: "ד", tone: "c", name: "דניאל ברק", code: "DANI", sales: 9870, orders: 36, fee: 987, status: "שולם", pill: "paid" }
];
const KPI_START = { creators: 38, sales: 312400, fees: 27915 };

// A fixed, believable sequence (who sold, basket size) instead of randomness.
const SEQUENCE: [number, number][] = [
  [0, 249],
  [1, 189],
  [0, 329],
  [2, 159],
  [1, 279],
  [0, 219],
  [2, 399],
  [1, 149]
];
const EVERY_MS = 2800;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const short = (n: number) => `${Math.round(n / 1000)}K`;

// Tweens the shown value to the new one (ease-out, 600ms) so updates read as
// growth rather than a swap.
function Count({ value, format = fmt }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * eased;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

function Money({ value, format }: { value: number; format?: (n: number) => string }) {
  return (
    <span className="cr-num">
      <Count value={value} format={format} />
      <span className="cur">₪</span>
    </span>
  );
}

// Alternating class names restart the highlight even when the same row is hit
// twice in a row (re-adding the same class would not replay the animation).
const hitClass = (hit: { row: number; n: number } | null, i: number) => (hit?.row === i ? (hit.n % 2 ? "is-hit-a" : "is-hit-b") : undefined);

export function HeroDashboard() {
  const root = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(START);
  const [kpi, setKpi] = useState(KPI_START);
  const [hit, setHit] = useState<{ row: number; amount: number; n: number } | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    let timer = 0;
    let n = 0;
    const tick = () => {
      if (visible && document.visibilityState === "visible") {
        const [row, amount] = SEQUENCE[n % SEQUENCE.length];
        const fee = Math.round(amount * 0.1);
        n += 1;
        setRows((rs) => rs.map((r, i) => (i === row ? { ...r, sales: r.sales + amount, orders: r.orders + 1, fee: r.fee + fee } : r)));
        setKpi((k) => ({ ...k, sales: k.sales + amount, fees: k.fees + fee }));
        setHit({ row, amount, n });
      }
      timer = window.setTimeout(tick, EVERY_MS);
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    // First order lands shortly after the entrance animation settles.
    timer = window.setTimeout(tick, 1800);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="cr-window cr-dark-ui" ref={root} aria-label="מערך המשפיענים ב־Hiloomy">
      <div className="cr-window-bar">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span className="cr-window-note">הנתונים לדוגמה בלבד.</span>
      </div>
      <div className="cr-ui">
        <div className="cr-ui-head">
          <div>
            <div className="cr-ui-title">מערך המשפיענים</div>
            <div className="cr-ui-sub">30 הימים האחרונים</div>
          </div>
          <span className="cr-pill ok">
            <span className="cr-live" aria-hidden="true" />
            מחובר ל־Shopify
          </span>
        </div>
        <div className="cr-kpis">
          <div className="cr-kpi">
            <div className="cr-kpi-label">משפיענים פעילים</div>
            <div className="cr-kpi-value">
              <span className="cr-num">{kpi.creators}</span>
            </div>
          </div>
          <div className="cr-kpi">
            <div className="cr-kpi-label">מכירות</div>
            <div className="cr-kpi-value">
              <span className="cr-wide">
                <Money value={kpi.sales} />
              </span>
              <span className="cr-short">
                <Money value={kpi.sales} format={short} />
              </span>
            </div>
          </div>
          <div className="cr-kpi">
            <div className="cr-kpi-label">עמלות</div>
            <div className="cr-kpi-value pos">
              <span className="cr-wide">
                <Money value={kpi.fees} />
              </span>
              <span className="cr-short">
                <Money value={kpi.fees} format={short} />
              </span>
            </div>
          </div>
        </div>
        <table className="cr-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>קוד</th>
              <th>הזמנות</th>
              <th>מכירות</th>
              <th>עמלה</th>
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.code} className={hitClass(hit, i)}>
                <td>
                  <span className="cr-who">
                    <span className={`cr-avatar ${r.tone}`}>{r.initial}</span>
                    {r.name}
                  </span>
                </td>
                <td>
                  <span className="cr-code">{r.code}</span>
                </td>
                <td>
                  <span className="cr-num">
                    <Count value={r.orders} />
                  </span>
                </td>
                <td className="cr-cell-sales">
                  <Money value={r.sales} />
                  {hit?.row === i ? (
                    <span key={hit.n} className="cr-plus-chip" aria-hidden="true">
                      +{fmt(hit.amount)} ₪
                    </span>
                  ) : null}
                </td>
                <td>
                  <Money value={r.fee} />
                </td>
                <td>
                  <span className={`cr-pill ${r.pill}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="cr-cards">
          {rows.map((r, i) => (
            <li key={r.code} className={["cr-card", hitClass(hit, i)].filter(Boolean).join(" ")}>
              <span className={`cr-avatar ${r.tone}`}>{r.initial}</span>
              <div className="cr-card-main">
                <div className="cr-card-name">
                  {r.name} <span className="cr-code">{r.code}</span>
                </div>
                <div className="cr-card-stats">
                  <Money value={r.sales} /> מכירות · <Money value={r.fee} /> עמלה
                </div>
              </div>
              {hit?.row === i ? (
                <span key={hit.n} className="cr-plus-chip" aria-hidden="true">
                  +{fmt(hit.amount)} ₪
                </span>
              ) : null}
              <span className={`cr-pill ${r.pill}`}>{r.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
