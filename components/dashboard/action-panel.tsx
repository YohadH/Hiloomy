import { CheckCircle2 } from "lucide-react";
import type { SummarySection } from "@/lib/domain/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ActionPanel({ sections }: { sections: SummarySection[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.title} className="bg-card/95 transition-shadow hover:shadow-lg">
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.items.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">Nothing to flag here for now.</p>
            ) : null}
            {section.items.map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
                <p className="text-sm leading-6 text-muted-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
