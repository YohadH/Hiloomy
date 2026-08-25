import { permanentRedirect } from "next/navigation";

// The COGS editor moved to /products/costs (F-041). This stub keeps every
// old link, bookmark, and alert fixHref working.
export default function LegacyProductCostsRedirect() {
  permanentRedirect("/products/costs");
}
