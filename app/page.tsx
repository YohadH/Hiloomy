import { redirect } from "next/navigation";

// The root URL is split by audience in middleware.ts:
//   - anonymous visitors  → rewritten to /welcome (marketing landing)
//   - signed-in users     → redirected to /dashboard (Command Center)
// This component only renders if a request slips past both (e.g. the
// local QA bypass); sending it to the dashboard keeps behavior identical.

export default function RootPage() {
  // Cast: typedRoutes' generated route union lags until the next build
  // picks up the new /dashboard segment.
  redirect("/dashboard" as never);
}
