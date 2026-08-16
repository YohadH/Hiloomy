import { redirect } from "next/navigation";

// The Gantt studio was moved to /marketing-planner (it IS the marketing
// planner now). This preserves any old bookmarks / in-app links.

export default function LegacyGanttRedirect() {
  redirect("/marketing-planner");
}
