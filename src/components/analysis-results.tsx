"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  ShieldCheck,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AnalysisResult,
  EnrichedFinding,
  RuleStatus,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

const statusOrder: RuleStatus[] = [
  "gap",
  "needs_review",
  "not_evaluated",
  "satisfied",
  "not_applicable",
];

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function FindingCard({
  finding,
  advisory = false,
}: {
  finding: EnrichedFinding;
  advisory?: boolean;
}) {
  return (
    <article className="rounded-xl border border-border/70 bg-background/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-primary">{finding.ruleId}</span>
            {advisory ? (
              <Badge variant="outline" className="text-muted-foreground">
                Opportunity advisory
              </Badge>
            ) : (
              <>
                <StatusBadge status={finding.status} />
                <Badge variant="outline" className="capitalize text-muted-foreground">
                  {finding.severity}
                </Badge>
              </>
            )}
          </div>
          <h4 className="font-medium text-foreground">{finding.title}</h4>
        </div>
        <a
          href={finding.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          {finding.authority}
          <ExternalLink className="size-3" />
        </a>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{finding.note}</p>
      {finding.evidence.length > 0 && (
        <div className="mt-3 space-y-2">
          {finding.evidence.map((evidence, index) => (
            <blockquote
              key={`${evidence.reference}-${index}`}
              className="border-l-2 border-primary/40 pl-3 text-xs leading-5 text-muted-foreground"
            >
              <span className="font-mono text-primary/85">{evidence.reference}</span>
              {" — “"}
              {evidence.quote}
              {"”"}
            </blockquote>
          ))}
        </div>
      )}
    </article>
  );
}

export function AnalysisResults({ result }: { result: AnalysisResult }) {
  const [copied, setCopied] = useState(false);
  const { extraction, gapCheck, memo } = result;
  const metadata = extraction.solicitationMeta;
  const readinessFindings = gapCheck.findings.filter(
    (finding) => finding.type === "readiness",
  );
  const advisoryFindings = gapCheck.findings.filter(
    (finding) => finding.type === "advisory",
  );
  const groupedRequirements = extraction.requirements.reduce<
    Array<{
      category: (typeof extraction.requirements)[number]["category"];
      items: typeof extraction.requirements;
    }>
  >((groups, requirement) => {
    const group = groups.find((item) => item.category === requirement.category);
    if (group) group.items.push(requirement);
    else groups.push({ category: requirement.category, items: [requirement] });
    return groups;
  }, []);

  async function copyMemo() {
    await navigator.clipboard.writeText(memo.memoMarkdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section className="space-y-5" aria-labelledby="analysis-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Analysis complete
          </p>
          <h2 id="analysis-heading" className="text-2xl font-semibold tracking-tight">
            {metadata.title ?? result.sourceName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {metadata.agency ?? "Agency not identified"}
            {metadata.solicitationNumber
              ? ` · ${metadata.solicitationNumber}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyMemo}>
            <Copy className="size-4" />
            {copied ? "Copied" : "Copy memo"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadFile("bidcheck-memo.md", memo.memoMarkdown, "text/markdown")
            }
          >
            <Download className="size-4" /> Markdown
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadFile(
                "bidcheck-analysis.json",
                JSON.stringify(result, null, 2),
                "application/json",
              )
            }
          >
            <FileJson className="size-4" /> JSON
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardDescription>Opportunity risk</CardDescription>
            <CardTitle className="capitalize">
              {gapCheck.signals.opportunityRisk}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Highest severity among triggered risk-driver rules
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardDescription>Readiness coverage</CardDescription>
            <CardTitle className="capitalize">
              {gapCheck.signals.readinessCoverage}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {gapCheck.signals.evaluatedRuleCount} of {gapCheck.signals.applicableRuleCount}{" "}
            evaluated — {gapCheck.signals.readinessCoverage}
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/[0.06]">
          <CardHeader className="pb-2">
            <CardDescription>Recommendation</CardDescription>
            <CardTitle className="text-primary">
              {memo.recommendation.replaceAll("_", " ")}
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xs text-muted-foreground">
            {memo.confidence.replaceAll("_", " ")}
          </CardContent>
        </Card>
      </div>

      {memo.confidence === "solicitation_only" && (
        <Alert className="border-zinc-500/25 bg-zinc-500/[0.06]">
          <ShieldCheck className="size-4" />
          <AlertTitle>Solicitation-side analysis only</AlertTitle>
          <AlertDescription>
            No company profile was provided. Applicable readiness rules remain not
            evaluated, and the recommendation cannot be an unconditional bid.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="memo" className="gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="memo">Executive memo</TabsTrigger>
          <TabsTrigger value="readiness">Readiness</TabsTrigger>
          <TabsTrigger value="requirements">
            Requirements ({extraction.requirements.length})
          </TabsTrigger>
          <TabsTrigger value="opportunity">Opportunity</TabsTrigger>
        </TabsList>

        <TabsContent value="memo">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">Bid / no-bid memo</CardTitle>
              <CardDescription>{memo.rationale}</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6">
              <div className="space-y-4 text-sm leading-7 text-foreground/90 [&_h1]:text-xl [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {memo.memoMarkdown}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="readiness" className="space-y-4">
          {gapCheck.topThreeActions.length > 0 && (
            <Card className="border-primary/20 bg-primary/[0.05]">
              <CardHeader>
                <CardTitle className="text-base">Top actions</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  {gapCheck.topThreeActions.map((action, index) => (
                    <li key={action} className="flex gap-3">
                      <span className="font-mono text-primary">0{index + 1}</span>
                      {action}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
          {statusOrder.map((status) => {
            const items = readinessFindings.filter(
              (finding) => finding.status === status,
            );
            if (items.length === 0) return null;
            const collapsed = status === "not_applicable";
            return (
              <Collapsible key={status} defaultOpen={!collapsed}>
                <Card className="border-border/70 bg-card/75">
                  <CardHeader className="py-4">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-auto w-full justify-between p-0 hover:bg-transparent"
                      >
                        <span className="flex items-center gap-2">
                          <StatusBadge status={status} />
                          <span className="font-mono text-xs text-muted-foreground">
                            {items.length}
                          </span>
                        </span>
                        <ChevronDown className="size-4 text-muted-foreground" />
                      </Button>
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-3 pt-0">
                      {items.map((finding) => (
                        <FindingCard key={finding.ruleId} finding={finding} />
                      ))}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </TabsContent>

        <TabsContent value="requirements">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">Extracted requirements</CardTitle>
              <CardDescription>
                Verbatim obligations in document order. Always verify against the source.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {groupedRequirements.map((group) => (
                <section key={group.category}>
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-sm font-semibold capitalize">
                      {group.category.replaceAll("_", " ")}
                    </h3>
                    <span className="font-mono text-xs text-muted-foreground">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {group.items.map((requirement) => (
                      <article
                        key={requirement.id}
                        className="rounded-xl border border-border/70 bg-background/35 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-primary">
                            {requirement.id}
                          </span>
                          {requirement.sectionReference && (
                            <span className="text-xs text-muted-foreground">
                              {requirement.sectionReference}
                            </span>
                          )}
                        </div>
                        <p className="mt-3 text-sm font-medium">
                          {requirement.summary}
                        </p>
                        <p className="mt-2 border-l-2 border-border pl-3 text-xs leading-5 text-muted-foreground">
                          “{requirement.verbatim}”
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opportunity" className="space-y-4">
          {advisoryFindings.length > 0 && (
            <Card className="border-primary/20 bg-primary/[0.04]">
              <CardHeader>
                <CardTitle className="text-lg">Opportunity advisories</CardTitle>
                <CardDescription>
                  Solicitation-side planning signals excluded from readiness coverage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {advisoryFindings.map((finding) => (
                  <FindingCard
                    key={finding.ruleId}
                    finding={finding}
                    advisory
                  />
                ))}
              </CardContent>
            </Card>
          )}
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">Opportunity details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {Object.entries({
                "Solicitation number": metadata.solicitationNumber,
                Agency: metadata.agency,
                NAICS: metadata.naicsCode,
                "Set-aside": metadata.setAside,
                "Contract type": metadata.contractType,
                "Response deadline": metadata.responseDeadline,
                "Questions deadline": metadata.questionsDeadline,
                "Period of performance": metadata.periodOfPerformance,
                "Place of performance": metadata.placeOfPerformance,
              }).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    {label}
                  </dt>
                  <dd className={cn("mt-1 text-sm", !value && "text-muted-foreground")}>
                    {value ?? "Not stated"}
                  </dd>
                </div>
              ))}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
