"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CreatorConnectionsManager({
  labels
}: {
  labels: {
    instagramConnectionTitle: string;
    instagramConnectionDescription: string;
    instagramToken: string;
    connectInstagram: string;
    connectInstagramOauth: string;
    connecting: string;
    syncLatestPosts: string;
    syncing: string;
    instagramConnected: string;
    instagramSynced: string;
    attributionTitle: string;
    attributionDescription: string;
    attributionDomain: string;
    attributionDomainPlaceholder: string;
    attributionKey: string;
    optionalForNow: string;
    saveAttribution: string;
    saving: string;
    attributionSaved: string;
    requestFailed: string;
    oauthHelp: string;
  };
}) {
  const searchParams = useSearchParams();
  const [instagramToken, setInstagramToken] = useState("");
  const [publicCrawlerHandles, setPublicCrawlerHandles] = useState("");
  const [attributionDomain, setAttributionDomain] = useState("");
  const [attributionKey, setAttributionKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const connected = searchParams.get("instagram");
    const oauthError = searchParams.get("instagram_error");
    if (connected === "connected") {
      setMessage(labels.instagramConnected);
      setError(null);
    } else if (oauthError) {
      setError(oauthError);
      setMessage(null);
    }
  }, [labels.instagramConnected, searchParams]);

  async function runRequest(action: string, input: RequestInfo, init: RequestInit, success: string) {
    setLoading(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(input, init);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? labels.requestFailed);
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.requestFailed);
    } finally {
      setLoading(null);
    }
  }

  async function runPublicCrawler() {
    setLoading("instagram-public-crawl");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/creator/instagram/public-crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandUsername: "incenseparfums",
          creatorHandles: publicCrawlerHandles,
          brandLimit: 24,
          creatorLimit: 12
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? labels.requestFailed);
      setMessage(
        `Public Instagram crawl finished: ${payload.profilesCrawled} profiles, ${payload.postsSaved} new posts, ${payload.postsUpdated} updated posts.`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.requestFailed);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{labels.instagramConnectionTitle}</CardTitle>
          <CardDescription>{labels.instagramConnectionDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">{labels.instagramToken}</span>
            <input
              type="password"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
              value={instagramToken}
              onChange={(event) => setInstagramToken(event.target.value)}
              placeholder="EAAG..."
            />
          </label>
          <p className="text-sm text-muted-foreground">{labels.oauthHelp}</p>
          <div className="flex flex-wrap gap-3">
            <a href="/api/creator/instagram/oauth/start">
              <Button type="button" disabled={loading !== null}>
                {labels.connectInstagramOauth}
              </Button>
            </a>
            <Button
              variant="secondary"
              disabled={loading !== null}
              onClick={() =>
                runRequest(
                  "instagram-connect",
                  "/api/creator/instagram/connect",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accessToken: instagramToken })
                  },
                  labels.instagramConnected
                )
              }
            >
              {loading === "instagram-connect" ? labels.connecting : labels.connectInstagram}
            </Button>
            <Button
              variant="secondary"
              disabled={loading !== null}
              onClick={() =>
                runRequest(
                  "instagram-sync",
                  "/api/creator/instagram/sync",
                  {
                    method: "POST"
                  },
                  labels.instagramSynced
                )
              }
            >
              {loading === "instagram-sync" ? labels.syncing : labels.syncLatestPosts}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public Instagram crawler</CardTitle>
          <CardDescription>
            Crawls only public posts/reels from @incenseparfums and pasted public influencer profiles. No login or private insights.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Influencer handles or profile URLs</span>
            <textarea
              className="min-h-28 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
              value={publicCrawlerHandles}
              onChange={(event) => setPublicCrawlerHandles(event.target.value)}
              placeholder="@creator_name&#10;https://www.instagram.com/creator_name/"
            />
          </label>
          <Button variant="secondary" disabled={loading !== null} onClick={runPublicCrawler}>
            {loading === "instagram-public-crawl" ? "Crawling..." : "Crawl public Instagram"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.attributionTitle}</CardTitle>
          <CardDescription>{labels.attributionDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">{labels.attributionDomain}</span>
            <input
              className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
              value={attributionDomain}
              onChange={(event) => setAttributionDomain(event.target.value)}
              placeholder={labels.attributionDomainPlaceholder}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">{labels.attributionKey}</span>
            <input
              type="password"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none ring-0"
              value={attributionKey}
              onChange={(event) => setAttributionKey(event.target.value)}
              placeholder={labels.optionalForNow}
            />
          </label>
          <Button
            disabled={loading !== null}
            onClick={() =>
              runRequest(
                "creator-attribution-save",
                "/api/creator/attribution/save",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ portalDomain: attributionDomain, apiKey: attributionKey })
                },
                labels.attributionSaved
              )
            }
          >
            {loading === "creator-attribution-save" ? labels.saving : labels.saveAttribution}
          </Button>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
