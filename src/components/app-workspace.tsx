"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Circle,
  FileSearch,
  LoaderCircle,
  RotateCcw,
  Scale,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AnalysisResults } from "@/components/analysis-results";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type {
  AnalysisResult,
  PipelineStage,
  StreamEvent,
} from "@/lib/contracts";
import {
  MAX_PROFILE_LENGTH,
  MAX_SOURCE_LENGTH,
  MIN_SOURCE_LENGTH,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

type Sample = {
  id: string;
  title: string;
  agency: string;
  sourceText: string;
};

type StageState = "idle" | "running" | "complete" | "error";
type SessionState = {
  sourceText: string;
  sourceName: string;
  companyProfile: string;
  result: AnalysisResult | null;
};

const STORAGE_KEY = "bidcheck:analysis:v2";
const stages: { id: PipelineStage; label: string; detail: string }[] = [
  { id: "extraction", label: "Extract", detail: "Requirements & metadata" },
  { id: "gap_check", label: "Check", detail: "Rules & evidence" },
  { id: "memo", label: "Decide", detail: "Executive recommendation" },
];

const emptyStages: Record<PipelineStage, StageState> = {
  extraction: "idle",
  gap_check: "idle",
  memo: "idle",
};

function getSessionId() {
  const key = "bidcheck:session-id";
  const current = window.sessionStorage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}

export function AppWorkspace({ samples }: { samples: readonly Sample[] }) {
  const [sourceText, setSourceText] = useState("");
  const [sourceName, setSourceName] = useState("Pasted solicitation");
  const [companyProfile, setCompanyProfile] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [stageStates, setStageStates] = useState(emptyStages);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const state = JSON.parse(saved) as SessionState;
          setSourceText(state.sourceText ?? "");
          setSourceName(state.sourceName ?? "Pasted solicitation");
          setCompanyProfile(state.companyProfile ?? "");
          setResult(state.result ?? null);
        } catch {
          window.sessionStorage.removeItem(STORAGE_KEY);
        }
      }
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: SessionState = {
      sourceText,
      sourceName,
      companyProfile,
      result,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [companyProfile, hydrated, result, sourceName, sourceText]);

  const validLength =
    sourceText.trim().length >= MIN_SOURCE_LENGTH &&
    sourceText.trim().length <= MAX_SOURCE_LENGTH;
  const progress = useMemo(() => {
    const complete = Object.values(stageStates).filter(
      (state) => state === "complete",
    ).length;
    const active = Object.values(stageStates).some((state) => state === "running");
    return Math.min(100, complete * 33 + (active ? 12 : 0));
  }, [stageStates]);

  function loadSample(sample: Sample) {
    setSourceText(sample.sourceText);
    setSourceName(sample.title);
    setResult(null);
    setError(null);
    setStageStates(emptyStages);
  }

  function clearSession() {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setSourceText("");
    setSourceName("Pasted solicitation");
    setCompanyProfile("");
    setResult(null);
    setError(null);
    setStageStates(emptyStages);
  }

  function handleEvent(event: StreamEvent) {
    if (event.type === "progress") {
      setStageStates((current) => ({
        ...current,
        [event.stage]: event.status === "started" ? "running" : "complete",
      }));
    } else if (event.type === "complete") {
      setResult(event.data);
    } else if (event.type === "error") {
      if (event.stage !== "request") {
        setStageStates((current) => ({ ...current, [event.stage]: "error" }));
      }
      setError(event.message);
    }
  }

  async function analyze() {
    if (!validLength || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setStageStates(emptyStages);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: sourceText.trim(),
          sourceName,
          companyProfile: companyProfile.trim() || undefined,
          sessionId: getSessionId(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? "The analysis request was rejected.");
      }
      if (!response.body) throw new Error("The analysis stream did not start.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handleEvent(JSON.parse(line) as StreamEvent);
        }
        if (done) break;
      }
      if (buffer.trim()) handleEvent(JSON.parse(buffer) as StreamEvent);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The analysis could not be completed.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <Scale className="size-5" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">BidCheck</p>
              <p className="text-xs text-muted-foreground">Federal pursuit intelligence</p>
            </div>
          </div>
          <Badge variant="outline" className="border-primary/20 text-primary">
            Hackathon build
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid items-end gap-8 lg:grid-cols-[1fr_0.65fr]">
          <div>
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-primary">
              Bid / no-bid, grounded in evidence
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
              Turn dense solicitations into an executive decision.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              BidCheck extracts binding requirements, evaluates federal readiness rules,
              and produces a traceable recommendation in one pass.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["01", "Extract"],
              ["02", "Check"],
              ["03", "Decide"],
            ].map(([number, label]) => (
              <div key={number} className="rounded-xl border border-border/60 bg-card/55 p-3">
                <p className="font-mono text-xs text-primary">{number}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.45fr_0.75fr]">
          <Card className="border-border/70 bg-card/80 shadow-2xl shadow-black/10">
            <CardHeader>
              <CardTitle>Solicitation text</CardTitle>
              <CardDescription>
                Paste a complete excerpt or load a demo fixture. No files are uploaded in v1.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                {samples.map((sample) => (
                  <Button
                    key={sample.id}
                    variant="outline"
                    size="sm"
                    disabled={running}
                    onClick={() => loadSample(sample)}
                    title={sample.agency}
                  >
                    <FileSearch className="size-4" />
                    {sample.title.replace("Fixture: ", "")}
                  </Button>
                ))}
              </div>
              <Label htmlFor="solicitation" className="sr-only">
                Solicitation text
              </Label>
              <Textarea
                id="solicitation"
                value={sourceText}
                onChange={(event) => {
                  setSourceText(event.target.value);
                  setSourceName("Pasted solicitation");
                }}
                disabled={running}
                maxLength={MAX_SOURCE_LENGTH}
                placeholder="Paste the solicitation text here…"
                className="min-h-80 resize-y bg-background/45 font-mono text-xs leading-5"
              />
              <div className="mt-2 flex items-center justify-between text-xs">
                <span
                  className={cn(
                    "text-muted-foreground",
                    sourceText.length > 0 && !validLength && "text-amber-300",
                  )}
                >
                  Minimum {MIN_SOURCE_LENGTH.toLocaleString()} characters
                </span>
                <span className="font-mono text-muted-foreground">
                  {sourceText.length.toLocaleString()} / {MAX_SOURCE_LENGTH.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/75">
            <CardHeader>
              <div className="mb-2 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <ShieldAlert className="size-5" />
              </div>
              <CardTitle>Company context</CardTitle>
              <CardDescription>
                Optional and self-reported. Missing evidence becomes not evaluated—never a gap.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="company-profile">Readiness profile</Label>
              <Textarea
                id="company-profile"
                value={companyProfile}
                onChange={(event) => setCompanyProfile(event.target.value)}
                disabled={running}
                maxLength={MAX_PROFILE_LENGTH}
                placeholder="Example: We are an active 8(a) under NAICS 541512. SAM is current. CMMC Level 2 is in progress. No cleared staff are currently available."
                className="mt-2 min-h-48 resize-y bg-background/45 text-sm leading-6"
              />
              <p className="mt-2 text-right font-mono text-xs text-muted-foreground">
                {companyProfile.length.toLocaleString()} / {MAX_PROFILE_LENGTH.toLocaleString()}
              </p>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-3">
              <Button
                size="lg"
                disabled={!validLength || running}
                onClick={analyze}
                className="w-full"
              >
                {running ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {running ? "Analyzing…" : "Run BidCheck"}
                {!running && <ArrowRight className="size-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={running}
                onClick={clearSession}
                className="text-muted-foreground"
              >
                <Trash2 className="size-4" /> Clear session
              </Button>
            </CardFooter>
          </Card>
        </section>

        {(running || Object.values(stageStates).some((state) => state !== "idle")) && (
          <Card className="border-primary/20 bg-card/80" aria-live="polite">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Analysis pipeline</CardTitle>
                  <CardDescription>Each stage uses the evidence produced before it.</CardDescription>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} className="mt-3" />
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {stages.map((stage) => {
                const state = stageStates[stage.id];
                return (
                  <div
                    key={stage.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-border/60 bg-background/30 p-3",
                      state === "running" && "border-primary/35 bg-primary/[0.05]",
                    )}
                  >
                    {state === "complete" ? (
                      <Check className="size-4 text-emerald-300" />
                    ) : state === "running" ? (
                      <LoaderCircle className="size-4 animate-spin text-primary" />
                    ) : state === "error" ? (
                      <RotateCcw className="size-4 text-red-300" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{stage.label}</p>
                      <p className="text-xs text-muted-foreground">{stage.detail}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert variant="destructive">
            <ShieldAlert className="size-4" />
            <AlertTitle>Analysis stopped</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={analyze} disabled={running}>
                <RotateCcw className="size-4" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {result && <AnalysisResults result={result} />}

        <Separator />
        <footer className="flex flex-col justify-between gap-3 pb-8 text-xs text-muted-foreground sm:flex-row">
          <div>
            <p>Decision support only. Verify every finding against the source solicitation.</p>
            <p className="mt-1">Copyright Daniel Lozovsky. All rights reserved.</p>
          </div>
          <p>No accounts · No analysis history · No server-side document storage</p>
        </footer>
      </main>
    </div>
  );
}
