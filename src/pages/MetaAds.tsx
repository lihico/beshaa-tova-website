import { useState, useEffect, useCallback } from "react";

interface AdInsight {
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  impressions: string;
  reach: string;
  clicks: string;
  cpc: string;
  cpm: string;
  ctr: string;
  spend: string;
  frequency?: string;
  date_start: string;
  date_stop: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
}

interface Summary {
  impressions: string;
  reach: string;
  spend: string;
  clicks: string;
  ctr: string;
  cpm: string;
  actions?: { action_type: string; value: string }[];
}

interface ApiResponse {
  summary: Summary | null;
  data: AdInsight[];
  level: string;
  date_preset?: string;
  time_range?: { since: string; until: string };
}

const DATE_PRESETS: { value: string; label: string }[] = [
  { value: "today", label: "היום" },
  { value: "yesterday", label: "אתמול" },
  { value: "last_7d", label: "7 ימים" },
  { value: "last_14d", label: "14 יום" },
  { value: "last_30d", label: "30 יום" },
  { value: "this_month", label: "החודש" },
  { value: "last_month", label: "חודש שעבר" },
];

const LEVELS: { value: string; label: string }[] = [
  { value: "campaign", label: "קמפיינים" },
  { value: "adset", label: "קבוצות מודעות" },
  { value: "ad", label: "מודעות" },
];

function formatNumber(val: string | number | undefined): string {
  if (val === undefined || val === null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return n.toLocaleString("he-IL");
}

function formatCurrency(val: string | number | undefined): string {
  if (val === undefined || val === null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(val: string | number | undefined): string {
  if (val === undefined || val === null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function getActionValue(
  actions: { action_type: string; value: string }[] | undefined,
  type: string,
): string {
  if (!actions) return "0";
  const action = actions.find((a) => a.action_type === type);
  return action?.value || "0";
}

function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export default function MetaAds() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [level, setLevel] = useState("campaign");
  const [authKey, setAuthKey] = useState(() => localStorage.getItem("meta_dash_key") || "");
  const [isAuthed, setIsAuthed] = useState(() => !!localStorage.getItem("meta_dash_key"));

  const fetchData = useCallback(async () => {
    if (!authKey) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ level, date_preset: datePreset });
      const res = await fetch(`/api/meta-ads?${params}`, {
        headers: { Authorization: `Bearer ${authKey}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `שגיאה ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  }, [authKey, level, datePreset]);

  useEffect(() => {
    if (isAuthed) fetchData();
  }, [isAuthed, fetchData]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("meta_dash_key", authKey);
    setIsAuthed(true);
  }

  if (!isAuthed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <h1 className="text-center text-xl font-semibold text-foreground">מעקב מודעות</h1>
          <p className="text-center text-sm text-muted-foreground">הזיני את מפתח הגישה לדשבורד</p>
          <input
            type="password"
            value={authKey}
            onChange={(e) => setAuthKey(e.target.value)}
            placeholder="מפתח גישה"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-300"
            dir="ltr"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-terracotta-500"
          >
            כניסה
          </button>
        </form>
      </div>
    );
  }

  const summary = data?.summary;
  const linkClicks = summary ? getActionValue(summary.actions, "link_click") : "0";
  const leads = summary ? getActionValue(summary.actions, "offsite_conversion.fb_pixel_lead") : "0";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" dir="rtl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">מעקב מודעות Meta</h1>
        <button
          onClick={() => {
            localStorage.removeItem("meta_dash_key");
            setIsAuthed(false);
            setData(null);
          }}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          התנתקות
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
          <label className="text-xs text-muted-foreground">תקופה</label>
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="bg-transparent text-sm font-medium text-foreground focus:outline-none"
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
          <label className="text-xs text-muted-foreground">רמה</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="bg-transparent text-sm font-medium text-foreground focus:outline-none"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="rounded-lg bg-terracotta-100 px-4 py-1.5 text-sm font-medium text-terracotta-700 transition-colors hover:bg-terracotta-200 disabled:opacity-50"
        >
          {loading ? "טוען..." : "רענון"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-terracotta-200 border-t-terracotta-500" />
        </div>
      )}

      {/* KPI Summary */}
      {summary && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard title="הוצאה" value={formatCurrency(summary.spend)} />
          <KpiCard title="חשיפות" value={formatNumber(summary.impressions)} />
          <KpiCard title="טווח הגעה" value={formatNumber(summary.reach)} />
          <KpiCard title="קליקים" value={formatNumber(summary.clicks)} />
          <KpiCard title="CTR" value={formatPercent(summary.ctr)} />
          <KpiCard title="קליקים על לינק" value={formatNumber(linkClicks)} subtitle={leads !== "0" ? `${leads} לידים` : undefined} />
        </div>
      )}

      {/* Table */}
      {data && data.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-right text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">שם</th>
                <th className="px-3 py-2.5 font-medium">הוצאה</th>
                <th className="px-3 py-2.5 font-medium">חשיפות</th>
                <th className="px-3 py-2.5 font-medium">טווח הגעה</th>
                <th className="px-3 py-2.5 font-medium">קליקים</th>
                <th className="px-3 py-2.5 font-medium">CTR</th>
                <th className="px-3 py-2.5 font-medium">CPC</th>
                <th className="px-3 py-2.5 font-medium">CPM</th>
                <th className="px-3 py-2.5 font-medium">תדירות</th>
                <th className="px-3 py-2.5 font-medium">תאריכים</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row, i) => {
                const name =
                  level === "ad"
                    ? row.ad_name
                    : level === "adset"
                      ? row.adset_name
                      : row.campaign_name;
                return (
                  <tr
                    key={i}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="max-w-[200px] truncate px-3 py-2.5 font-medium text-foreground">
                      {name || "—"}
                    </td>
                    <td className="px-3 py-2.5" dir="ltr">{formatCurrency(row.spend)}</td>
                    <td className="px-3 py-2.5" dir="ltr">{formatNumber(row.impressions)}</td>
                    <td className="px-3 py-2.5" dir="ltr">{formatNumber(row.reach)}</td>
                    <td className="px-3 py-2.5" dir="ltr">{formatNumber(row.clicks)}</td>
                    <td className="px-3 py-2.5" dir="ltr">{formatPercent(row.ctr)}</td>
                    <td className="px-3 py-2.5" dir="ltr">{formatCurrency(row.cpc)}</td>
                    <td className="px-3 py-2.5" dir="ltr">{formatCurrency(row.cpm)}</td>
                    <td className="px-3 py-2.5" dir="ltr">{row.frequency ? parseFloat(row.frequency).toFixed(1) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground" dir="ltr">
                      {row.date_start} – {row.date_stop}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.data.length === 0 && !loading && (
        <div className="py-20 text-center text-muted-foreground">
          אין נתונים לתקופה שנבחרה
        </div>
      )}

      {/* Actions breakdown (if available) */}
      {data && data.data.length > 0 && data.data.some((r) => r.actions?.length) && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-terracotta-600 hover:text-terracotta-700">
            פירוט פעולות (Actions)
          </summary>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-right text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">שם</th>
                  <th className="px-3 py-2.5 font-medium">קליק על לינק</th>
                  <th className="px-3 py-2.5 font-medium">צפיות בדף</th>
                  <th className="px-3 py-2.5 font-medium">לידים</th>
                  <th className="px-3 py-2.5 font-medium">תגובות</th>
                  <th className="px-3 py-2.5 font-medium">שיתופים</th>
                  <th className="px-3 py-2.5 font-medium">עלות ללינק</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row, i) => {
                  const name =
                    level === "ad"
                      ? row.ad_name
                      : level === "adset"
                        ? row.adset_name
                        : row.campaign_name;
                  return (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="max-w-[200px] truncate px-3 py-2.5 font-medium text-foreground">
                        {name || "—"}
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {formatNumber(getActionValue(row.actions, "link_click"))}
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {formatNumber(getActionValue(row.actions, "landing_page_view"))}
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {formatNumber(getActionValue(row.actions, "offsite_conversion.fb_pixel_lead"))}
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {formatNumber(getActionValue(row.actions, "comment"))}
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {formatNumber(getActionValue(row.actions, "post"))}
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {formatCurrency(
                          getActionValue(row.cost_per_action_type, "link_click"),
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
