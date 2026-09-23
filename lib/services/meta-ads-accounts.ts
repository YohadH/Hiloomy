// Ad accounts a Meta user token can reach, grouped by business portfolio.
//
// /me/adaccounts only lists accounts assigned to the USER. An account that
// was granted through a Business opt-in in the OAuth dialog (the merchant
// ticks "Hbosem" and nothing else) never appears there, so we also walk
// every business the token can see and merge its owned + client accounts.
// Shared by the OAuth callback (renewal check) and the account picker.

const GRAPH = "https://graph.facebook.com/v19.0";

export interface MetaAdAccountOption {
  // Always the act_-prefixed id, exactly as Graph returns it.
  id: string;
  name: string;
  businessId: string | null;
  businessName: string | null;
  active: boolean;
  accountStatus: number | null;
  currency: string | null;
  timezoneName: string | null;
}

interface GraphAdAccount {
  id: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  business?: { id?: string; name?: string };
}

async function graphList<T>(path: string, accessToken: string, fields: string): Promise<T[]> {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.error) {
    throw new Error(payload?.error?.message ?? `Meta Graph request failed (${res.status}).`);
  }
  return (payload?.data ?? []) as T[];
}

export async function listMetaAdAccounts(accessToken: string): Promise<MetaAdAccountOption[]> {
  const fields = "id,name,account_status,currency,timezone_name,business{id,name}";
  const byId = new Map<string, MetaAdAccountOption>();
  const put = (account: GraphAdAccount, business?: { id: string; name?: string }) => {
    if (!account?.id || byId.has(account.id)) return;
    byId.set(account.id, {
      id: account.id,
      name: account.name ?? account.id,
      businessId: account.business?.id ?? business?.id ?? null,
      businessName: account.business?.name ?? business?.name ?? null,
      active: account.account_status === 1,
      accountStatus: account.account_status ?? null,
      currency: account.currency ?? null,
      timezoneName: account.timezone_name ?? null
    });
  };

  for (const account of await graphList<GraphAdAccount>("/me/adaccounts", accessToken, fields)) put(account);
  const businesses = await graphList<{ id: string; name?: string }>("/me/businesses", accessToken, "id,name").catch(
    () => [] as Array<{ id: string; name?: string }>
  );
  for (const business of businesses) {
    for (const edge of ["owned_ad_accounts", "client_ad_accounts"] as const) {
      const accounts = await graphList<GraphAdAccount>(`/${business.id}/${edge}`, accessToken, fields).catch(
        () => [] as GraphAdAccount[]
      );
      for (const account of accounts) put(account, business);
    }
  }

  // Business portfolios first (alphabetical), accounts without one last —
  // the picker renders this order as option groups.
  return [...byId.values()].sort((a, b) => {
    const ba = a.businessName ?? "￿";
    const bb = b.businessName ?? "￿";
    return ba.localeCompare(bb) || a.name.localeCompare(b.name);
  });
}
