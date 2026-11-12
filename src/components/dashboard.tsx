"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Database,
  FileSearch,
  LogOut,
  Plus,
  Search,
  Shirt,
  Sparkles,
  Target,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOutAction } from "@/app/auth-actions";
import { getProductCompleteness } from "@/lib/products";
import { CATEGORY_CALCULATIONS } from "@/lib/scoring";
import type { AiAuditResult } from "@/lib/ai-audit-schema";

type CategoryKey = "visibility" | "accuracy" | "competitive" | "completeness";
type CategoryScore = { id: string; category: CategoryKey; score: number | null; evidenceCount: number; calculation: string };
type Product = {
  id: string; name: string; description: string; price: number | null; category: string;
  imageUrl: string; specifications: string; requiredFields: string; updatedAt: string;
};
type AuditResponse = {
  id: string; question: string; response: string; sourceName: string; collectionMethod: string;
  observedAt: string; brandMentioned: boolean;
  competitorMentions: Array<{ id: string; competitor: string; mentionCount: number }>;
};
type AccuracyCheck = {
  id: string; responseId: string | null; productId: string | null; claim: string; observedValue: string; verifiedValue: string;
  outcome: string; discrepancyType: string; severity: string; suggestedCorrection: string; reviewStatus: string;
  product: { id: string; name: string } | null;
};
type FieldSnapshot = {
  id: string; productId: string; productName: string; fieldName: string; fieldValue: string; completed: boolean;
};
type Audit = {
  id: string; sourceType: "SIMULATED" | "EXTERNAL"; sourceName: string; collectionMethod: string;
  methodologyVersion: string; sampleSize: number; createdAt: string; responses: AuditResponse[];
  accuracyChecks: AccuracyCheck[]; categoryScores: CategoryScore[]; productFieldSnapshots: FieldSnapshot[];
  scoreSnapshot: { overallScore: number | null; classification: string } | null;
};
type Recommendation = {
  id: string; title: string; category: string; productId: string | null; issue: string; supportingEvidence: string;
  recommendedAction: string; whyItMatters: string; priority: string; effort: string; approvalStatus: string;
  completionStatus: string; updatedAt: string;
  statusChanges: Array<{ approvalStatus: string; completionStatus: string; changedAt: string }>;
};
type AuditEvidenceSummary = {
  responses: Array<{ question: string; response: string; brandMentioned: boolean }>;
  accuracyChecks: Array<{ claim: string; observedValue: string; verifiedValue: string; outcome: string }>;
};
type FollowUp = { id: string; scheduledFor: string; status: string };
type HistoryItem = {
  id: string; date: string; sourceType: string; sourceName: string; collectionMethod: string; sampleSize: number;
  score: number | null; classification: string; categoryScores: CategoryScore[];
  questionSetHash: string; methodologyVersion: string; evidence: AuditEvidenceSummary;
};
type DashboardData = {
  brands: Array<{ id: string; name: string }>;
  brand: { id: string; name: string }; products: Product[]; latestAudit: Audit | null; history: HistoryItem[];
  previousComparable: { id: string; score: number | null } | null; recommendations: Recommendation[];
  followUps: FollowUp[];
  catalogCompleteness: { completed: number; required: number };
};
type AiAnalysis = {
  result: AiAuditResult;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; cached: boolean };
  model: string;
};
type AiUsageSummary = {
  applicationBudgetUsd: number;
  demoReserveUsd: number;
  estimatedSpendUsd: number;
  reservedSpendUsd: number;
  remainingBudgetUsd: number;
  requestsPerUserThisHour: Array<{ label: string; isCurrentUser: boolean; requestCount: number }>;
  requestLimitPerUserPerHour: number;
};

const categories: Array<{
  key: CategoryKey; title: string; weight: string; caption: string; color: string;
  icon: typeof Activity; description: string;
}> = [
  { key: "visibility", title: "AI brand visibility", weight: "35%", caption: "Show up in the answers that matter.", color: "mint", icon: Activity, description: "How often your brand appeared in the shopping responses captured for this audit." },
  { key: "accuracy", title: "Product accuracy", weight: "30%", caption: "Keep every product detail trustworthy.", color: "blue", icon: ClipboardCheck, description: "How often checked product claims matched information your business verified." },
  { key: "competitive", title: "Competitive presence", weight: "20%", caption: "Understand your share of sampled mentions.", color: "lavender", icon: BarChart3, description: "Your brand mentions compared with recorded competitor mentions in the same sample." },
  { key: "completeness", title: "Product completeness", weight: "15%", caption: "Give AI the context it needs.", color: "peach", icon: Database, description: "How much applicable product information is present in your catalog at audit time." },
];

const emptyAuditForm = {
  sourceType: "SIMULATED" as "SIMULATED" | "EXTERNAL",
  sourceName: "",
  collectionMethod: "",
  question: "",
  response: "",
  brandMentioned: false,
  competitor: "",
  competitorCount: "1",
  addCheck: false,
  productId: "",
  claim: "",
  observedValue: "",
  verifiedValue: "",
  outcome: "INACCURATE",
  discrepancyType: "inaccurate_attribute",
  severity: "medium",
  suggestedCorrection: "",
};

function scoreFor(audit: Audit | null, key: CategoryKey): number | null {
  return audit?.categoryScores.find((item) => item.category === key)?.score ?? null;
}

function formatDate(date: string | null | undefined) {
  return date ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date)) : "Not yet audited";
}

function formatAiDollars(value: number) {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function ScoreRing({ score }: { score: number | null }) {
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const offset = score === null ? circumference : circumference * (1 - score / 100);
  return (
    <div className="score-ring" aria-label={score === null ? "Insufficient data" : `Brand score ${score} out of 100`}>
      <svg viewBox="0 0 160 160" role="img" aria-hidden="true">
        <circle className="ring-track" cx="80" cy="80" r={radius} />
        {score !== null && <circle className="ring-value" cx="80" cy="80" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} />}
      </svg>
      <div className="ring-label">
        <strong>{score ?? "—"}</strong>
        <span>out of 100</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState(() =>
    typeof window === "undefined"
      ? "local-brand"
      : window.localStorage.getItem("aishelf-selected-brand") ?? "local-brand",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState("Overview");
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<AccuracyCheck | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleMin, setScheduleMin] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [auditForm, setAuditForm] = useState(emptyAuditForm);
  const [productForm, setProductForm] = useState({ name: "", description: "", price: "", category: "", imageUrl: "", specifications: "{}", requiresSpecifications: false });
  const [compareId, setCompareId] = useState("");
  const [saving, setSaving] = useState(false);
  const [accuracyFilter, setAccuracyFilter] = useState("all");
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [aiUsageError, setAiUsageError] = useState("");
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [aiClaimSelected, setAiClaimSelected] = useState<boolean[]>([]);
  const [aiClaimOutcomes, setAiClaimOutcomes] = useState<string[]>([]);
  const [aiMissingSelected, setAiMissingSelected] = useState<boolean[]>([]);
  const [aiRecommendationSelected, setAiRecommendationSelected] = useState<boolean[]>([]);
  const [aiCompetitorSelected, setAiCompetitorSelected] = useState<boolean[]>([]);
  const aiRequestId = useRef(0);

  function clearAiReview() {
    aiRequestId.current += 1;
    setAiAnalyzing(false);
    setAiAnalysis(null);
    setAiClaimSelected([]);
    setAiClaimOutcomes([]);
    setAiMissingSelected([]);
    setAiRecommendationSelected([]);
    setAiCompetitorSelected([]);
  }

  function closeAuditForm() {
    setAuditOpen(false);
    clearAiReview();
  }

  const loadData = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        headers: { "x-aishelf-brand-id": selectedBrandId },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Dashboard could not be loaded.");
      setData(body as DashboardData);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [selectedBrandId]);

  // Dashboard data is fetched after hydration so the browser's saved brand can be selected.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  const loadAiUsage = useCallback(async () => {
    setAiUsageLoading(true);
    try {
      const response = await fetch("/api/ai-usage", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "AI usage could not be loaded.");
      setAiUsage(body as AiUsageSummary);
      setAiUsageError("");
    } catch (usageError) {
      setAiUsage(null);
      setAiUsageError(usageError instanceof Error ? usageError.message : "AI usage could not be loaded.");
    } finally {
      setAiUsageLoading(false);
    }
  }, []);

  function openAuditForm() {
    setAuditOpen(true);
    void loadAiUsage();
  }

  const latest = data?.latestAudit ?? null;
  const overall = latest?.scoreSnapshot?.overallScore ?? null;
  const delta = latest && data?.previousComparable?.score != null && overall != null
    ? overall - data.previousComparable.score
    : null;
  const incompleteProducts = useMemo(() => data?.products.filter((product) => {
    const completeness = getProductCompleteness([product]);
    return completeness.completed < completeness.required;
  }) ?? [], [data]);
  const activeHistory = data?.history.find((item) => item.id === compareId) ?? null;

  async function sendJson(url: string, method: string, payload: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-aishelf-brand-id": selectedBrandId },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "The request could not be completed.");
    return body;
  }

  async function submitAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const competitorCounts = new Map<string, { competitor: string; mentionCount: number }>();
      if (auditForm.competitor.trim()) {
        const competitor = auditForm.competitor.trim();
        competitorCounts.set(competitor.toLocaleLowerCase(), {
          competitor,
          mentionCount: Number(auditForm.competitorCount),
        });
      }
      aiAnalysis?.result.competitorMentions.forEach((mention, index) => {
        if (!aiCompetitorSelected[index]) return;
        const key = mention.competitor.toLocaleLowerCase();
        const existing = competitorCounts.get(key);
        competitorCounts.set(key, {
          competitor: existing?.competitor ?? mention.competitor,
          mentionCount: (existing?.mentionCount ?? 0) + mention.mentionCount,
        });
      });
      const accuracyChecks = [
        ...(auditForm.addCheck && auditForm.productId
          ? [{
          productId: auditForm.productId,
          claim: auditForm.claim,
          observedValue: auditForm.observedValue,
          verifiedValue: auditForm.verifiedValue,
          outcome: auditForm.outcome,
          discrepancyType: auditForm.discrepancyType,
          severity: auditForm.severity,
          suggestedCorrection: auditForm.suggestedCorrection,
          }]
          : []),
        ...(aiAnalysis?.result.claimFindings.flatMap((finding, index) =>
          aiClaimSelected[index] && finding.productId
            ? [{
              productId: finding.productId,
              claim: finding.claim,
              observedValue: finding.observedValue || finding.evidenceQuote,
              verifiedValue: finding.verifiedValue || "Not provided in the catalog",
              outcome: aiClaimOutcomes[index] ?? "UNVERIFIED",
              discrepancyType: finding.discrepancyType,
              severity: finding.severity,
              suggestedCorrection: finding.suggestedCorrection,
            }]
            : [],
        ) ?? []),
        ...(aiAnalysis?.result.missingInformation.flatMap((finding, index) =>
          aiMissingSelected[index]
            ? [{
              productId: finding.productId,
              claim: `Missing product information: ${finding.fieldName}`,
              observedValue: "",
              verifiedValue: "Not provided in the catalog",
              outcome: "MISSING",
              discrepancyType: "missing_information",
              severity: "low",
              suggestedCorrection: finding.recommendation,
            }]
            : [],
        ) ?? []),
      ];
      const recommendations = aiAnalysis?.result.recommendations.filter((_, index) =>
        aiRecommendationSelected[index]
      ) ?? [];
      await sendJson("/api/audits", "POST", {
        ...auditForm,
        competitorMentions: [...competitorCounts.values()],
        ...(accuracyChecks.length ? { accuracyChecks } : {}),
        ...(recommendations.length ? { recommendations } : {}),
      });
      setAuditForm(emptyAuditForm);
      setAuditOpen(false);
      clearAiReview();
      setNotice("Evidence saved. Scores were calculated from this audit and the current product catalog.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Audit evidence could not be saved.");
    } finally {
      setSaving(false);
    }

  }

  async function analyzeAuditWithAi() {
    const requestId = ++aiRequestId.current;
    setAiAnalyzing(true);
    setError("");
    try {
      const analysis = await sendJson("/api/ai-audit", "POST", {
        question: auditForm.question,
        response: auditForm.response,
      }) as AiAnalysis;
      if (requestId !== aiRequestId.current) return;
      setAiAnalysis(analysis);
      setAiClaimSelected(analysis.result.claimFindings.map(() => false));
      setAiClaimOutcomes(analysis.result.claimFindings.map(() => "UNVERIFIED"));
      setAiMissingSelected(analysis.result.missingInformation.map(() => false));
      setAiRecommendationSelected(analysis.result.recommendations.map(() => false));
      setAiCompetitorSelected(analysis.result.competitorMentions.map(() => false));
    } catch (analysisError) {
      if (requestId === aiRequestId.current) {
        setError(analysisError instanceof Error ? analysisError.message : "AI analysis could not be completed.");
      }
    } finally {
      if (requestId === aiRequestId.current) setAiAnalyzing(false);
      void loadAiUsage();
    }
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...productForm,
        price: productForm.price.trim() === "" ? null : Number(productForm.price),
      };
      if (editingProduct) {
        await sendJson(`/api/products/${editingProduct.id}`, "PATCH", payload);
      } else {
        await sendJson("/api/products", "POST", payload);
      }
      setProductOpen(false);
      setEditingProduct(null);
      setProductForm({ name: "", description: "", price: "", category: "", imageUrl: "", specifications: "{}", requiresSpecifications: false });
      setNotice(editingProduct ? "Product information updated." : "Product added to your catalog.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Product could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function generateRecommendations() {
    if (!latest) return;
    setSaving(true);
    setError("");
    try {
      await sendJson("/api/recommendations", "POST", { auditId: latest.id });
      setSection("Recommendations");
      setNotice("Recommendations created from recorded audit findings.");
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Recommendations could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function updateRecommendation(id: string, patch: { approvalStatus?: string; completionStatus?: string }) {
    setError("");
    try {
      await sendJson(`/api/recommendations/${id}`, "PATCH", patch);
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Recommendation could not be updated.");
    }
  }

  async function updateIssue(issue: AccuracyCheck, reviewStatus: string) {
    setError("");
    try {
      await sendJson(`/api/issues/${issue.id}`, "PATCH", { reviewStatus });
      setSelectedIssue({ ...issue, reviewStatus });
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Issue status could not be updated.");
    }
  }

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await sendJson("/api/follow-ups", "POST", { scheduledFor: new Date(scheduleDate).toISOString() });
      setScheduleOpen(false);
      setScheduleDate("");
      setNotice("Follow-up audit scheduled. You can record its evidence when it takes place.");
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Follow-up audit could not be scheduled.");
    } finally {
      setSaving(false);
    }
  }

  function openFollowUpScheduler() {
    setScheduleMin(new Date(Date.now() + 60_000).toISOString().slice(0, 16));
    setScheduleDate("");
    setScheduleOpen(true);
  }

  function selectBrand(brandId: string) {
    window.localStorage.setItem("aishelf-selected-brand", brandId);
    setSelectedBrandId(brandId);
    setLoading(true);
    setData(null);
    setError("");
    setSelectedIssue(null);
    setAuditForm(emptyAuditForm);
    clearAiReview();
  }

  function editProduct(product: Product) {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description,
      price: product.price == null ? "" : String(product.price),
      category: product.category,
      imageUrl: product.imageUrl,
      specifications: product.specifications,
      requiresSpecifications: JSON.parse(product.requiredFields).some((field: string) => field.startsWith("specifications")),
    });
    setProductOpen(true);
  }

  const scoreLabel = overall === null ? "Insufficient data" : latest?.scoreSnapshot?.classification ?? "Scored";
  const selectedCategoryData = selectedCategory ? categories.find((item) => item.key === selectedCategory) : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-mark" href="#" aria-label="AIShelf home">
          <span className="brand-symbol"><span /></span>
          <span>ai<span className="brand-light">shelf</span></span>
        </a>
        <span className="nav-caption">WORKSPACE</span>
        <nav className="main-nav" aria-label="Main navigation">
          {[
            { name: "Overview", icon: BarChart3 },
            { name: "Products", icon: Database, badge: data?.products.length },
            { name: "Recommendations", icon: Sparkles, badge: data?.recommendations.filter((item) => item.approvalStatus === "pending").length },
            { name: "Score history", icon: Activity },
          ].map(({ name, icon: Icon, badge }) => (
            <button key={name} className={`nav-link ${section === name ? "active" : ""}`} onClick={() => setSection(name)}>
              <Icon size={17} /><span>{name}</span>{typeof badge === "number" && badge > 0 && <i>{badge}</i>}
            </button>
          ))}
          <Link className="nav-link" href="/why-aishelf"><Shirt size={17} /><span>Why AIShelf</span></Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><span>Learn how AIShelf scores your brand.</span><button onClick={() => setSelectedCategory("visibility")}>Explore scoring <ArrowRight size={13} /></button></div>
          <div className="profile-row"><div className="profile-avatar">D</div><div><strong>Demo workspace</strong><span>Local prototype</span></div><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>{section}</strong></div>
          <div className="top-actions">
            <label className="brand-workspace-select">
              <span>Brand</span>
              <select
                aria-label="Select brand workspace"
                value={data?.brands.some((brand) => brand.id === selectedBrandId) ? selectedBrandId : data?.brand.id ?? "local-brand"}
                onChange={(event) => selectBrand(event.target.value)}
              >
                {(data?.brands ?? [{ id: "local-brand", name: "Your brand" }]).map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
            </label>
            <span className="data-badge"><span /> Local data</span>
            <button className="icon-button" aria-label="Search"><Search size={18} /></button>
            <form action={signOutAction}>
              <button className="icon-button" aria-label="Sign out" title="Sign out" type="submit"><LogOut size={18} /></button>
            </form>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="alert error-alert" role="alert"><TriangleAlert size={16} />{error}<button onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}
          {notice && <div className="alert success-alert" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
          {loading && !data ? <div className="loading-state"><span className="spinner" />Loading your workspace…</div> : null}

          {section === "Overview" && (
            <>
              <div className="page-heading">
                <div><div className="eyebrow"><span className="eyebrow-dot" /> BRAND INTELLIGENCE</div><h1>Your visibility, <em>in focus.</em></h1><p>A clearer picture of how AI shopping experiences understand your brand.</p></div>
                <button className="button primary" onClick={() => { setAuditForm(emptyAuditForm); clearAiReview(); openAuditForm(); }}><Plus size={16} /> Record audit evidence</button>
              </div>

              <section className="score-hero">
                <div className="hero-copy">
                  <div className="hero-title-row"><span className="section-kicker"><Target size={15} /> AISHELF BRAND SCORE</span><span className={`classification ${overall === null ? "muted" : ""}`}>{scoreLabel}</span></div>
                  <h2>{overall === null ? "Your score starts with evidence." : "A strong foundation. Room to grow."}</h2>
                  <p>{overall === null
                    ? "Add a product and record an audit observation to build your first transparent score. We never fill data gaps with guesswork."
                    : `Based on ${latest?.sampleSize ?? 0} recorded ${latest?.sourceType === "SIMULATED" ? "simulated" : "external"} sample${latest?.sampleSize === 1 ? "" : "s"} from ${latest?.sourceName}.`}</p>
                  <div className="hero-meta">
                    <div><span className="meta-icon"><Clock3 size={14} /></span><span><small>LAST AUDIT</small><strong>{formatDate(latest?.createdAt)}</strong></span></div>
                    <div><span className="meta-icon"><FileSearch size={14} /></span><span><small>OBSERVATION SOURCE</small><strong>{latest ? `${latest.sourceType === "SIMULATED" ? "Simulated · " : "External · "}${latest.sourceName}` : "No audit evidence yet"}</strong></span></div>
                  </div>
                  <div className="hero-buttons">
                    <button className="button dark-button" onClick={generateRecommendations} disabled={!latest || saving}><Sparkles size={15} /> Improve my score</button>
                    <button className="button subtle-button" onClick={() => setSelectedCategory("visibility")}>View full analysis <ArrowRight size={15} /></button>
                  </div>
                </div>
                <div className="hero-score">
                  <ScoreRing score={overall} />
                  <strong>{overall === null ? "Insufficient data" : latest?.scoreSnapshot?.classification}</strong>
                  <span>{delta === null ? "Change appears after a comparable audit" : `${delta >= 0 ? "+" : ""}${delta} pts since comparable audit`}</span>
                </div>
                <div className="hero-footnote"><CircleHelp size={13} /> AIShelf Score is a proprietary diagnostic indicator—not an official platform rating or a forecast of business results.</div>
              </section>

              <div className="section-heading"><div><span className="eyebrow">THE SCORECARD</span><h2>Four signals. One clearer picture.</h2></div><span className="section-note">Select a category to explore its evidence <ArrowRight size={13} /></span></div>
              <div className="category-grid">
                {categories.map(({ key, title, weight, caption, color, icon: Icon }) => {
                  const score = scoreFor(latest, key);
                  return (
                    <button key={key} className={`category-card ${color}`} onClick={() => setSelectedCategory(key)}>
                      <div className="category-top"><span className="category-icon"><Icon size={17} /></span><span className="weight-chip">{weight} weight</span><ArrowRight className="card-arrow" size={15} /></div>
                      <div className="category-score">{score === null ? <span className="no-score">—</span> : score}<small>{score === null ? "Insufficient data" : "/100"}</small></div>
                      <strong>{title}</strong><span className="category-caption">{caption}</span>
                      <div className="progress-track"><span style={{ width: `${score ?? 0}%` }} /></div>
                    </button>
                  );
                })}
              </div>

              <div className="lower-grid">
                <section className="panel issue-panel">
                  <div className="panel-heading"><div><span className="eyebrow">NEEDS YOUR ATTENTION</span><h2>High-priority issues</h2></div><span className="count-chip">{latest?.accuracyChecks.filter((check) => check.severity === "high" && check.reviewStatus !== "resolved").length ?? 0}</span></div>
                  {latest?.accuracyChecks.length ? latest.accuracyChecks.filter((check) => check.outcome !== "ACCURATE").slice(0, 3).map((check) => (
                    <button className="issue-row" key={check.id} onClick={() => setSelectedIssue(check)}>
                      <span className={`issue-dot ${check.severity}`}><TriangleAlert size={14} /></span><span className="issue-text"><strong>{check.product?.name ?? "Product claim"} · {check.discrepancyType}</strong><small>{check.claim} · {check.reviewStatus.replace("_", " ")}</small></span><ArrowRight size={15} />
                    </button>
                  )) : <div className="empty-inline"><span className="empty-icon"><ClipboardCheck size={17} /></span><span><strong>No verified issues yet</strong><small>Record an audit with a product claim to investigate a finding.</small></span></div>}
                  {latest?.accuracyChecks.length ? <button className="text-link" onClick={() => setSelectedCategory("accuracy")}>View all findings <ArrowRight size={13} /></button> : null}
                </section>
                <section className="panel quick-panel">
                  <div className="panel-heading"><div><span className="eyebrow">NEXT BEST STEP</span><h2>Build a stronger foundation</h2></div><span className="sparkle-icon"><Sparkles size={17} /></span></div>
                  <p>{incompleteProducts.length
                    ? `${incompleteProducts.length} product${incompleteProducts.length === 1 ? " is" : "s are"} missing required details. Complete the catalog before interpreting a completeness score.`
                    : data?.products.length
                      ? "Your catalog fields are complete. Capture observations from a consistent set of shopping questions to understand how your brand is represented."
                      : "Add your first product. AIShelf checks applicable product fields before calculating a score."}</p>
                  <button className="button outline-button" onClick={() => setSection(data?.products.length ? "Score history" : "Products")}>
                    {data?.products.length ? "Explore audit history" : "Review product catalog"} <ArrowRight size={14} />
                  </button>
                  <div className="mini-progress"><div><span>PRODUCT CATALOG</span><strong>{data?.catalogCompleteness.required ? `${Math.round(data.catalogCompleteness.completed / data.catalogCompleteness.required * 100)}%` : "—"}</strong></div><div className="progress-track"><span style={{ width: `${data?.catalogCompleteness.required ? data.catalogCompleteness.completed / data.catalogCompleteness.required * 100 : 0}%` }} /></div></div>
                </section>
              </div>
              <p className="method-note"><Database size={13} /> Scores are calculated on the server from recorded evidence. Simulated responses and genuine external observations are never combined.</p>
            </>
          )}

          {section === "Products" && (
            <>
              <div className="page-heading compact-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> CATALOG HEALTH</div><h1>Product <em>catalog.</em></h1><p>Keep verified source information clear, complete, and ready to audit.</p></div><button className="button primary" onClick={() => { setEditingProduct(null); setProductForm({ name: "", description: "", price: "", category: "", imageUrl: "", specifications: "{}", requiresSpecifications: false }); setProductOpen(true); }}><Plus size={16} /> Add product</button></div>
              <section className="catalog-summary"><div className="summary-value">{data?.products.length ?? 0}</div><div><strong>Products in your catalog</strong><span>Completeness is evaluated against applicable fields at the time of each audit.</span></div><div className="catalog-percent">{data?.catalogCompleteness.required ? `${Math.round(data.catalogCompleteness.completed / data.catalogCompleteness.required * 100)}%` : "—"}<small>FIELD COVERAGE</small></div></section>
              {data?.products.length ? <div className="product-list">{data.products.map((product) => {
                const missing = getProductCompleteness([product]).snapshots.filter((field) => !field.completed);
                return <article className="product-card" key={product.id}>
                  <div className="product-image" role={product.imageUrl ? "img" : undefined} aria-label={product.imageUrl ? `${product.name} product image` : undefined} style={product.imageUrl ? { backgroundImage: `url("${product.imageUrl}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>{product.imageUrl ? null : <Database size={20} />}</div>
                  <div className="product-main"><strong>{product.name}</strong><span>{product.category || "Category missing"} {product.price != null && `· $${product.price.toFixed(2)}`}</span><small>{product.description || "Description missing"}</small></div>
                  <div className={`product-status ${missing.length ? "needs-update" : "complete"}`}><span />{missing.length ? `${missing.length} fields to complete` : "Ready to audit"}</div>
                  <button className="button tiny-button" onClick={() => editProduct(product)}>Edit details</button>
                </article>;
              })}</div> : <div className="empty-state"><span className="empty-art"><Database size={24} /></span><h2>Your catalog starts here.</h2><p>Add the verified details AI systems should be able to find. No catalog means no completeness score.</p><button className="button primary" onClick={() => setProductOpen(true)}><Plus size={15} /> Add your first product</button></div>}
              <div className="note-card"><CircleHelp size={16} /><span><strong>What counts as complete?</strong> Product name, description, price, category, and image URL are checked by default. Add category-specific fields to your product schema as your catalog grows.</span></div>
            </>
          )}

          {section === "Recommendations" && (
            <>
              <div className="page-heading compact-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ACTION PLAN</div><h1>Make the next move <em>clear.</em></h1><p>Recommendations are grounded in saved audit issues—not generated scores or automatic publishing.</p></div><div className="heading-actions"><button className="button outline-button" onClick={openFollowUpScheduler}><Clock3 size={14} /> Schedule follow-up audit</button><button className="button primary" disabled={!latest || saving} onClick={generateRecommendations}><Sparkles size={15} /> Generate from latest audit</button></div></div>
              {data?.followUps.length ? <div className="follow-up-strip"><Clock3 size={15} /><strong>Scheduled follow-ups</strong>{data.followUps.map((item) => <span key={item.id}>{formatDate(item.scheduledFor)} · {item.status}</span>)}</div> : null}
              {data?.recommendations.length ? <div className="recommendation-list">{data.recommendations.map((item) => (
                <article className="recommendation-card" key={item.id}>
                  <div className="recommendation-card-top"><span className={`priority ${item.priority}`}>{item.priority} priority</span><span className="recommendation-category">{item.category}</span><span className={`approval-chip ${item.approvalStatus}`}>{item.approvalStatus.replace("_", " ")}</span></div>
                  <h2>{item.title}</h2><p>{item.issue}</p><div className="evidence-quote"><span>SUPPORTING EVIDENCE</span>{item.supportingEvidence}</div>
                  <div className="action-details"><div><span>RECOMMENDED ACTION</span><p>{item.recommendedAction}</p></div><div><span>WHY IT MATTERS</span><p>{item.whyItMatters}</p></div></div>
                  <div className="recommendation-footer"><span>Effort · {item.effort}</span><div className="recommendation-actions">
                    <button className="button tiny-button" onClick={() => { setSection("Overview"); setSelectedCategory("accuracy"); }}>Review evidence</button>
                    {item.approvalStatus === "pending" && <button className="button tiny-button green-button" onClick={() => updateRecommendation(item.id, { approvalStatus: "approved" })}>Approve</button>}
                    {item.approvalStatus !== "rejected" && item.completionStatus !== "implemented" && <button className="button tiny-button" onClick={() => updateRecommendation(item.id, { completionStatus: "in_progress" })}>In progress</button>}
                    {item.completionStatus !== "implemented" && <button className="button tiny-button" onClick={() => updateRecommendation(item.id, { completionStatus: "implemented" })}>Mark implemented</button>}
                    {item.approvalStatus === "pending" && <button className="button tiny-button reject-button" onClick={() => updateRecommendation(item.id, { approvalStatus: "rejected" })}>Reject</button>}
                  </div></div>
                  <div className="completion-track"><span>{item.completionStatus.replace("_", " ")}</span><span className={`completion-indicator ${item.completionStatus}`} /><span className="status-history">{item.statusChanges.length} status update{item.statusChanges.length === 1 ? "" : "s"}</span></div>
                </article>
              ))}</div> : <div className="empty-state"><span className="empty-art"><Sparkles size={24} /></span><h2>Useful advice starts with real evidence.</h2><p>Record a claim that needs review, then build an action plan from that finding.</p><button className="button primary" onClick={openAuditForm}>Record audit evidence <ArrowRight size={15} /></button></div>}
              <p className="method-note"><CircleHelp size={13} /> Recommendations do not publish website changes and cannot guarantee better visibility or external AI recommendations.</p>
            </>
          )}

          {section === "Score history" && (
            <>
              <div className="page-heading compact-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> AUDIT TRAIL</div><h1>Progress, <em>with context.</em></h1><p>Compare only audits captured with matching sources, methods, and tested questions.</p></div><button className="button primary" onClick={openAuditForm}><Plus size={16} /> Record follow-up</button></div>
              <section className="history-panel">
                <div className="panel-heading"><div><span className="eyebrow">OVERALL BRAND SCORE</span><h2>Audit snapshots</h2></div><span className="history-label"><span /> Stored evidence only</span></div>
                {data?.history.length ? <div className="history-chart" aria-label="Historical score chart">{data.history.slice().reverse().map((item) => <button key={item.id} className={`history-bar-wrap ${compareId === item.id ? "selected" : ""}`} onClick={() => setCompareId(item.id)}>
                  <span className="history-score">{item.score ?? "—"}</span><span className="history-bar" style={{ height: `${item.score ?? 5}%` }} /><span className="history-date">{formatDate(item.date)}</span><span className="history-source">{item.sourceType === "SIMULATED" ? "Simulated" : "External"}</span>
                </button>)}</div> : <div className="empty-chart"><BarChart3 size={21} /><span>No audit snapshots yet. Enter evidence to start your history.</span></div>}
              </section>
              {activeHistory && <section className="compare-panel"><div className="panel-heading"><div><span className="eyebrow">AUDIT COMPARISON</span><h2>{formatDate(activeHistory.date)} · {activeHistory.sourceName}</h2></div><select aria-label="Select audit to compare" value={compareId} onChange={(event) => setCompareId(event.target.value)}>{data?.history.map((item) => <option key={item.id} value={item.id}>{formatDate(item.date)} · {item.sourceType}</option>)}</select></div>
                <p className="comparison-disclaimer">Select a snapshot above to compare its category readings with the latest audit. Direct comparisons are only meaningful when sources and tested questions match exactly.</p>
                <div className="comparison-grid">{categories.map(({ key, title }) => {
                  const now = latest?.categoryScores.find((item) => item.category === key)?.score ?? null;
                  const then = activeHistory.categoryScores.find((item) => item.category === key)?.score ?? null;
                  const comparable = activeHistory.id !== latest?.id &&
                    activeHistory.sourceType === latest?.sourceType &&
                    activeHistory.sourceName === latest?.sourceName &&
                    activeHistory.collectionMethod === latest?.collectionMethod &&
                    activeHistory.methodologyVersion === latest?.methodologyVersion &&
                    activeHistory.questionSetHash === data?.history[0]?.questionSetHash;
                  const change = now !== null && then !== null && comparable ? now - then : null;
                  return <div key={key} className="comparison-item"><span>{title}</span><strong>{then ?? "—"} <small>→</small> {now ?? "—"}</strong><em>{change === null ? "Not directly comparable" : `${change > 0 ? "+" : ""}${change} pts`}</em></div>;
                })}</div>
                <div className="comparison-evidence"><div><span className="eyebrow">SELECTED AUDIT · {formatDate(activeHistory.date)}</span>{activeHistory.evidence.responses.map((item, index) => <div className="comparison-quote" key={`${item.question}-${index}`}><strong>{item.question}</strong><p>{item.response}</p><small>{item.brandMentioned ? "Brand mentioned" : "Brand absent"}</small></div>)}{activeHistory.evidence.accuracyChecks.map((item, index) => <div className="comparison-quote" key={`${item.claim}-${index}`}><strong>{item.claim} · {item.outcome.toLowerCase()}</strong><p>Observed: {item.observedValue || "missing"} · Verified: {item.verifiedValue}</p></div>)}</div><div><span className="eyebrow">LATEST AUDIT · {formatDate(data?.history[0]?.date)}</span>{data?.history[0]?.evidence.responses.map((item, index) => <div className="comparison-quote" key={`${item.question}-${index}`}><strong>{item.question}</strong><p>{item.response}</p><small>{item.brandMentioned ? "Brand mentioned" : "Brand absent"}</small></div>)}{data?.history[0]?.evidence.accuracyChecks.map((item, index) => <div className="comparison-quote" key={`${item.claim}-${index}`}><strong>{item.claim} · {item.outcome.toLowerCase()}</strong><p>Observed: {item.observedValue || "missing"} · Verified: {item.verifiedValue}</p></div>)}</div></div>
              </section>}
              <div className="audit-list">{data?.history.map((item) => <div className="audit-row" key={item.id}><div><strong>{formatDate(item.date)}</strong><span>{item.sourceName} · {item.sourceType === "SIMULATED" ? "Simulated response" : "External observation"}</span></div><span>{item.sampleSize} sample{item.sampleSize === 1 ? "" : "s"}</span><strong>{item.score ?? "—"} <small>/100</small></strong></div>)}</div>
            </>
          )}
        </div>
      </main>

      {selectedCategoryData && selectedCategory && (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCategory(null); }}>
          <section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <div className="drawer-header"><div><span className={`category-icon ${selectedCategoryData.color}`}><selectedCategoryData.icon size={17} /></span><span className="eyebrow">{selectedCategoryData.weight} OF AISHELF SCORE</span><h2 id="detail-title">{selectedCategoryData.title}</h2></div><button className="icon-button" onClick={() => setSelectedCategory(null)} aria-label="Close details"><X size={18} /></button></div>
            <div className="drawer-score"><strong>{scoreFor(latest, selectedCategory) ?? "—"}<small>{scoreFor(latest, selectedCategory) === null ? " Insufficient data" : " / 100"}</small></strong><span>{selectedCategoryData.description}</span></div>
            <div className="formula-card"><span>HOW THIS IS CALCULATED</span><p>{latest?.categoryScores.find((item) => item.category === selectedCategory)?.calculation ?? CATEGORY_CALCULATIONS[selectedCategory]}</p><small>Methodology v{latest?.methodologyVersion ?? "1.0"} · Deterministic server-side calculation</small></div>
            {selectedCategory === "visibility" && <div className="drawer-section"><div className="drawer-section-title"><h3>Captured shopping questions</h3><span>{latest?.responses.length ?? 0} tested</span></div>{latest?.responses.length ? latest.responses.map((item) => <div className="evidence-card" key={item.id}><div className="evidence-top"><span className={item.brandMentioned ? "mention-pill yes" : "mention-pill no"}>{item.brandMentioned ? "Brand mentioned" : "Brand absent"}</span><small>{formatDate(item.observedAt)}</small></div><strong>“{item.question}”</strong><p>{item.response}</p><span className="evidence-source">{item.sourceName} · {item.collectionMethod}</span></div>) : <p className="empty-message">No captured responses are linked to this audit yet.</p>}<p className="caveat">Absence in this sample is not proof of poor visibility across an entire platform.</p></div>}
            {selectedCategory === "accuracy" && <div className="drawer-section"><div className="drawer-section-title"><h3>Product claim checks</h3><span>{latest?.accuracyChecks.length ?? 0} recorded</span></div>
              <label className="filter-select">Filter findings<select value={accuracyFilter} onChange={(event) => setAccuracyFilter(event.target.value)}><option value="all">All findings</option><option value="incorrect_price">Incorrect prices</option><option value="outdated_description">Outdated descriptions</option><option value="unsupported_claim">Unsupported claims</option><option value="inaccurate_attribute">Inaccurate attributes</option><option value="missing_information">Missing information</option><option value="unverified">Needs human verification</option></select></label>
              {latest?.accuracyChecks.length ? latest.accuracyChecks.filter((check) => accuracyFilter === "all" || check.discrepancyType === accuracyFilter || (accuracyFilter === "unverified" && check.outcome === "UNVERIFIED")).map((check) => <button className="finding-row" key={check.id} onClick={() => setSelectedIssue(check)}><span className={`finding-indicator ${check.outcome.toLowerCase()}`} /><span><strong>{check.product?.name ?? "Product"} · {check.discrepancyType.replaceAll("_", " ")}</strong><small>{check.claim} · {check.severity} severity · {check.reviewStatus.replaceAll("_", " ")}</small></span><ArrowRight size={15} /></button>) : <p className="empty-message">No claim checks in this audit. Missing and unverified data are not counted as factual contradictions.</p>}</div>}
            {selectedCategory === "competitive" && <div className="drawer-section"><div className="drawer-section-title"><h3>Relative sampled mentions</h3><span>{latest?.responses.length ?? 0} prompts</span></div>{latest?.responses.map((item) => <div className="competitor-row" key={item.id}><span>{item.question}</span><div><b>{item.brandMentioned ? data?.brand.name ?? "Brand" : "Brand absent"}</b>{item.competitorMentions.map((mention) => <i key={mention.id}>{mention.competitor} × {mention.mentionCount}</i>)}</div></div>)}<p className="caveat">This sample is not market share or a comprehensive AI search ranking.</p></div>}
            {selectedCategory === "completeness" && <div className="drawer-section"><div className="drawer-section-title"><h3>Audited product fields</h3><span>{latest?.productFieldSnapshots.length ?? 0} fields</span></div>{latest?.productFieldSnapshots.length ? latest.productFieldSnapshots.map((field) => <div className="field-row" key={field.id}><span className={field.completed ? "field-check checked" : "field-check"}>{field.completed ? <Check size={11} /> : <X size={11} />}</span><span><strong>{field.productName}</strong><small>{field.fieldName}</small></span><em>{field.completed ? field.fieldValue || "Complete" : "Missing"}</em></div>) : <p className="empty-message">No product fields were present in this audit snapshot.</p>}<button className="text-link" onClick={() => { setSelectedCategory(null); setSection("Products"); }}>Open product catalog <ArrowRight size={13} /></button></div>}
            <div className="drawer-foot"><span>Observation source: <strong>{latest ? `${latest.sourceType === "SIMULATED" ? "Simulated" : "External"} · ${latest.sourceName}` : "None recorded"}</strong></span><button className="button outline-button" onClick={() => { setSelectedCategory(null); openAuditForm(); }}>Add audit evidence</button></div>
          </section>
        </div>
      )}

      {selectedIssue && (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedIssue(null); }}>
          <section className="issue-dialog" role="dialog" aria-modal="true" aria-labelledby="issue-title">
            <div className="drawer-header"><div><span className="eyebrow">ISSUE INVESTIGATION · {selectedIssue.severity.toUpperCase()} PRIORITY</span><h2 id="issue-title">{selectedIssue.product?.name ?? "Product claim"} · {selectedIssue.discrepancyType}</h2></div><button className="icon-button" onClick={() => setSelectedIssue(null)} aria-label="Close investigation"><X size={18} /></button></div>
            <div className="investigation-content">
              <div className="investigation-block"><span>DETECTED CLAIM</span><strong>{selectedIssue.claim}</strong></div>
              <div className="investigation-grid"><div><span>OBSERVED RESPONSE</span><p>{selectedIssue.observedValue || "No value recorded"}</p></div><div><span>VERIFIED BUSINESS INFORMATION</span><p>{selectedIssue.verifiedValue || "No verified value recorded"}</p></div></div>
              {(() => {
                const evidence = latest?.responses.find((response) => response.id === selectedIssue.responseId);
                return evidence ? <div className="investigation-block"><span>ORIGINAL SHOPPING QUESTION · {evidence.sourceName} · {formatDate(evidence.observedAt)}</span><p>{evidence.question}</p><blockquote>{evidence.response}</blockquote></div> : null;
              })()}
              <div className="investigation-block"><span>AISHELF ANALYSIS</span><p>{selectedIssue.outcome === "MISSING" ? "The tested response did not include information checked against the verified business record. Missing information is distinct from a factual contradiction." : selectedIssue.outcome === "UNVERIFIED" ? "This observation has not yet been confirmed against verified business information." : `The captured value differs from the verified value. Current review status: ${selectedIssue.reviewStatus.replace("_", " ")}.`}</p></div>
              <div className="investigation-block suggested"><span>SUGGESTED CORRECTION</span><p>{selectedIssue.suggestedCorrection || "Review the product’s authorized source pages and feeds; confirm the correct information before making any changes."}</p></div>
            </div>
            <div className="dialog-actions"><button className="button tiny-button" onClick={() => updateIssue(selectedIssue, "rejected")}>Reject finding</button><button className="button tiny-button" onClick={() => updateIssue(selectedIssue, "approved")}>Approve finding</button><button className="button primary" onClick={() => updateIssue(selectedIssue, "resolved")}><Check size={14} /> Mark resolved</button></div>
          </section>
        </div>
      )}

      {auditOpen && (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAuditForm(); }}>
          <form className="form-dialog" onSubmit={submitAudit}>
            <div className="drawer-header"><div><span className="eyebrow">AUDIT EVIDENCE</span><h2>Record an observation</h2></div><button type="button" className="icon-button" onClick={closeAuditForm} aria-label="Close form"><X size={18} /></button></div>
            <p className="form-intro">Enter a real captured response. AIShelf will calculate only the metrics supported by this evidence; incomplete categories remain unavailable.</p>
            <div className="form-grid"><label>Observation type<select value={auditForm.sourceType} onChange={(event) => setAuditForm({ ...auditForm, sourceType: event.target.value as "SIMULATED" | "EXTERNAL" })}><option value="SIMULATED">Simulated response</option><option value="EXTERNAL">External platform observation</option></select></label><label>Source / platform<input required placeholder="e.g. Internal simulation, platform name" value={auditForm.sourceName} onChange={(event) => setAuditForm({ ...auditForm, sourceName: event.target.value })} /></label></div>
            <label>Collection method<input required placeholder="e.g. Manually captured, API integration" value={auditForm.collectionMethod} onChange={(event) => setAuditForm({ ...auditForm, collectionMethod: event.target.value })} /></label>
            <label>Exact shopping question<textarea required rows={2} maxLength={500} placeholder="What was asked?" value={auditForm.question} onChange={(event) => { clearAiReview(); setAuditForm({ ...auditForm, question: event.target.value }); }} /></label>
            <label>Captured response<textarea required rows={4} maxLength={12_000} placeholder="Paste the original captured response" value={auditForm.response} onChange={(event) => { clearAiReview(); setAuditForm({ ...auditForm, response: event.target.value }); }} /></label>
            <section className="ai-usage-card" aria-label="AI usage and cost safeguards" aria-live="polite">
              <div className="ai-usage-heading"><strong>AI usage safeguards</strong><button type="button" className="text-link" onClick={() => void loadAiUsage()} disabled={aiUsageLoading}>Refresh</button></div>
              {aiUsageLoading && <p>Loading shared usage…</p>}
              {!aiUsageLoading && aiUsageError && <p className="ai-usage-error">{aiUsageError} AI analysis stays disabled until usage controls are available.</p>}
              {aiUsage && (
                <>
                  <div className="ai-usage-metrics">
                    <div><small>Estimated project spend</small><strong>{formatAiDollars(aiUsage.estimatedSpendUsd)} / {formatAiDollars(aiUsage.applicationBudgetUsd)}</strong></div>
                    <div><small>Budget remaining</small><strong>{formatAiDollars(aiUsage.remainingBudgetUsd)}</strong></div>
                    <div><small>Reserved for demonstrations</small><strong>{formatAiDollars(aiUsage.demoReserveUsd)}</strong></div>
                    <div><small>Your requests this hour</small><strong>{aiUsage.requestsPerUserThisHour.find((member) => member.isCurrentUser)?.requestCount ?? 0} / {aiUsage.requestLimitPerUserPerHour}</strong></div>
                  </div>
                  <div className="ai-usage-members">
                    {aiUsage.requestsPerUserThisHour.map((member) => (
                      <span key={member.label}>{member.label}: {member.requestCount} request{member.requestCount === 1 ? "" : "s"}</span>
                    ))}
                  </div>
                  {aiUsage.reservedSpendUsd > 0 && <small className="ai-usage-pending">{formatAiDollars(aiUsage.reservedSpendUsd)} is reserved for pending or uncertain requests.</small>}
                </>
              )}
            </section>
            <div className="ai-analyze-row">
              <button type="button" className="button outline-button" onClick={analyzeAuditWithAi} disabled={!aiUsage || aiAnalyzing || saving || !auditForm.question.trim() || !auditForm.response.trim()}>
                <Sparkles size={14} /> {aiAnalyzing ? "Analyzing…" : "Analyze with AI"}
              </button>
              <span>Draft analysis only; nothing is saved until you review and submit.</span>
            </div>
            {aiAnalysis && (
              <section className="ai-review-panel" aria-label="Review AI audit suggestions">
                <div className="ai-review-heading">
                  <div><strong>Review suggested findings</strong><span>{aiAnalysis.model} · {aiAnalysis.usage.inputTokens} input / {aiAnalysis.usage.outputTokens} output / {aiAnalysis.usage.totalTokens} total tokens{aiAnalysis.usage.cached ? " · cached, no new API call" : ""}</span></div>
                  <button type="button" className="button tiny-button" onClick={() => { clearAiReview(); void analyzeAuditWithAi(); }}>Analyze again</button>
                </div>
                <p className="ai-review-caution">AI suggestions can be wrong. Check the captured response and verified catalog details yourself. Claim outcomes start as “Needs verification”; selected findings are saved only when you submit this audit.</p>
                <div className="ai-review-item">
                  <span><strong>Brand mention</strong><small>{aiAnalysis.result.brandEvidence || "No supporting quote provided."}</small></span>
                  <button type="button" className="button tiny-button" onClick={() => setAuditForm({ ...auditForm, brandMentioned: aiAnalysis.result.brandMentioned })}>
                    Use {aiAnalysis.result.brandMentioned ? "mentioned" : "not mentioned"}
                  </button>
                </div>
                {aiAnalysis.result.competitorMentions.length > 0 && <div className="ai-review-group">
                  <strong>Competitor mentions</strong>
                  {aiAnalysis.result.competitorMentions.map((mention, index) => <label className="ai-review-check" key={`${mention.competitor}-${index}`}>
                    <input type="checkbox" checked={aiCompetitorSelected[index] ?? false} onChange={(event) => setAiCompetitorSelected((items) => items.map((selected, itemIndex) => itemIndex === index ? event.target.checked : selected))} />
                    <span><strong>{mention.competitor} · {mention.mentionCount}</strong><small>{mention.evidence}</small></span>
                  </label>)}
                </div>}
                {aiAnalysis.result.missingInformation.length > 0 && <div className="ai-review-group">
                  <strong>Potentially missing product information</strong>
                  {aiAnalysis.result.missingInformation.map((finding, index) => <label className="ai-review-check" key={`${finding.productId}-${finding.fieldName}-${index}`}>
                    <input type="checkbox" checked={aiMissingSelected[index] ?? false} onChange={(event) => setAiMissingSelected((items) => items.map((selected, itemIndex) => itemIndex === index ? event.target.checked : selected))} />
                    <span><strong>{finding.productName} · {finding.fieldName}</strong><small>{finding.reason} Suggested next step: {finding.recommendation}</small></span>
                  </label>)}
                </div>}
                {aiAnalysis.result.claimFindings.length > 0 && <div className="ai-review-group">
                  <strong>Product claim findings</strong>
                  {aiAnalysis.result.claimFindings.map((finding, index) => <div className="ai-claim-review" key={`${finding.productId}-${finding.claim}-${index}`}>
                    <label className="ai-review-check">
                      <input type="checkbox" disabled={!finding.productId} checked={aiClaimSelected[index] ?? false} onChange={(event) => setAiClaimSelected((items) => items.map((selected, itemIndex) => itemIndex === index ? event.target.checked : selected))} />
                      <span><strong>{finding.productName ?? "Product not identified"} · {finding.claim}</strong><small>AI suggests {finding.outcome.toLowerCase().replaceAll("_", " ")} · quote: “{finding.evidenceQuote || "No quote supplied"}” · catalog: {finding.verifiedValue || "No matching verified detail"}</small></span>
                    </label>
                    <label className="ai-outcome-select">Your reviewed outcome
                      <select value={aiClaimOutcomes[index] ?? "UNVERIFIED"} onChange={(event) => setAiClaimOutcomes((items) => items.map((outcome, itemIndex) => itemIndex === index ? event.target.value : outcome))}>
                        <option value="UNVERIFIED">Needs verification</option><option value="INACCURATE">Verified inaccurate</option><option value="ACCURATE">Verified accurate</option><option value="MISSING">Missing information</option>
                      </select>
                    </label>
                    {!finding.productId && <small className="ai-disabled-note">This finding cannot be saved as a product claim because it is not linked to a catalog product.</small>}
                  </div>)}
                </div>}
                {aiAnalysis.result.recommendations.length > 0 && <div className="ai-review-group">
                  <strong>Recommendations</strong>
                  {aiAnalysis.result.recommendations.map((recommendation, index) => <label className="ai-review-check" key={`${recommendation.title}-${index}`}>
                    <input type="checkbox" checked={aiRecommendationSelected[index] ?? false} onChange={(event) => setAiRecommendationSelected((items) => items.map((selected, itemIndex) => itemIndex === index ? event.target.checked : selected))} />
                    <span><strong>{recommendation.title} · {recommendation.priority} priority</strong><small>{recommendation.issue} {recommendation.recommendedAction}</small></span>
                  </label>)}
                </div>}
              </section>
            )}
            <label className="checkbox-label"><input type="checkbox" checked={auditForm.brandMentioned} onChange={(event) => setAuditForm({ ...auditForm, brandMentioned: event.target.checked })} /> The response mentioned my brand</label>
            <div className="form-grid"><label>Competitor observed (optional)<input placeholder="Competitor name" value={auditForm.competitor} onChange={(event) => setAuditForm({ ...auditForm, competitor: event.target.value })} /></label><label>Recorded mentions<input type="number" min="1" value={auditForm.competitorCount} onChange={(event) => setAuditForm({ ...auditForm, competitorCount: event.target.value })} /></label></div>
            <label className="checkbox-label"><input type="checkbox" checked={auditForm.addCheck} onChange={(event) => setAuditForm({ ...auditForm, addCheck: event.target.checked })} /> Add a product claim verification</label>
            {auditForm.addCheck && <div className="nested-form">
              <label>Product<select required value={auditForm.productId} onChange={(event) => setAuditForm({ ...auditForm, productId: event.target.value })}><option value="">Select a catalog product</option>{data?.products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
              <label>Claim checked<input required value={auditForm.claim} onChange={(event) => setAuditForm({ ...auditForm, claim: event.target.value })} placeholder="e.g. Listed product price" /></label>
              <div className="form-grid"><label>Observed value<input required={auditForm.outcome !== "MISSING"} value={auditForm.observedValue} onChange={(event) => setAuditForm({ ...auditForm, observedValue: event.target.value })} placeholder={auditForm.outcome === "MISSING" ? "No observed value" : ""} /></label><label>Verified value<input required value={auditForm.verifiedValue} onChange={(event) => setAuditForm({ ...auditForm, verifiedValue: event.target.value })} /></label></div>
              <div className="form-grid"><label>Review outcome<select value={auditForm.outcome} onChange={(event) => setAuditForm({ ...auditForm, outcome: event.target.value, discrepancyType: event.target.value === "MISSING" ? "missing_information" : auditForm.discrepancyType })}><option value="INACCURATE">Contradiction found</option><option value="ACCURATE">Matches verified info</option><option value="MISSING">Information missing</option><option value="UNVERIFIED">Needs human verification</option></select></label><label>Severity<select value={auditForm.severity} onChange={(event) => setAuditForm({ ...auditForm, severity: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>
              <label>Discrepancy type<select value={auditForm.discrepancyType} onChange={(event) => setAuditForm({ ...auditForm, discrepancyType: event.target.value })}><option value="incorrect_price">Incorrect price</option><option value="outdated_description">Outdated description</option><option value="unsupported_claim">Unsupported claim</option><option value="inaccurate_attribute">Inaccurate product attribute</option><option value="missing_information">Missing information</option></select></label>
              <label>Suggested correction<input value={auditForm.suggestedCorrection} onChange={(event) => setAuditForm({ ...auditForm, suggestedCorrection: event.target.value })} placeholder="Optional owner-reviewed next step" /></label>
            </div>}
            <div className="modal-actions"><button type="button" className="button subtle-button" onClick={closeAuditForm}>Cancel</button><button className="button primary" disabled={saving || aiAnalyzing || (auditForm.addCheck && !auditForm.productId)}>{saving ? "Saving…" : "Save evidence and score"} <ArrowRight size={14} /></button></div>
            <p className="form-footnote"><CircleHelp size={13} /> AI analysis is limited to this local development demo. Suggestions are not saved until reviewed here; scores remain deterministic and do not use unverified model suggestions.</p>
          </form>
        </div>
      )}

      {productOpen && (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProductOpen(false); }}>
          <form className="form-dialog product-dialog" onSubmit={submitProduct}>
            <div className="drawer-header"><div><span className="eyebrow">VERIFIED PRODUCT INFORMATION</span><h2>{editingProduct ? "Update product" : "Add a product"}</h2></div><button type="button" className="icon-button" onClick={() => setProductOpen(false)} aria-label="Close form"><X size={18} /></button></div>
            <p className="form-intro">Enter details from an authorized business source. Missing data stays missing—AIShelf will not invent product attributes.</p>
            <label>Product name<input required value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
            <label>Description<textarea rows={3} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
            <div className="form-grid"><label>Price<input type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label><label>Category<input value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} /></label></div>
            <label>Product image URL<input type="url" placeholder="https://" value={productForm.imageUrl} onChange={(event) => setProductForm({ ...productForm, imageUrl: event.target.value })} /></label>
            <label>Specifications (JSON)<textarea rows={3} value={productForm.specifications} onChange={(event) => setProductForm({ ...productForm, specifications: event.target.value })} placeholder={'{"material":"cotton","size":"medium"}'} /></label>
            <label className="checkbox-label"><input type="checkbox" checked={productForm.requiresSpecifications} onChange={(event) => setProductForm({ ...productForm, requiresSpecifications: event.target.checked })} /> Treat specifications as required for this product</label>
            <div className="modal-actions"><button type="button" className="button subtle-button" onClick={() => setProductOpen(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : editingProduct ? "Save product" : "Add product"} <ArrowRight size={14} /></button></div>
          </form>
        </div>
      )}

      {scheduleOpen && (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setScheduleOpen(false); }}>
          <form className="form-dialog" onSubmit={submitFollowUp}>
            <div className="drawer-header"><div><span className="eyebrow">FOLLOW-UP</span><h2>Schedule an audit reminder</h2></div><button type="button" className="icon-button" onClick={() => setScheduleOpen(false)} aria-label="Close form"><X size={18} /></button></div>
            <p className="form-intro">Set a reminder to capture a comparable audit. AIShelf will not automatically query an external platform.</p>
            <label>Follow-up date<input type="datetime-local" required min={scheduleMin} value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></label>
            <div className="modal-actions"><button type="button" className="button subtle-button" onClick={() => setScheduleOpen(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Scheduling…" : "Schedule reminder"} <ArrowRight size={14} /></button></div>
          </form>
        </div>
      )}
    </div>
  );
}
