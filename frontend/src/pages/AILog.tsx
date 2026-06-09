import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Trash2, FileText, Loader2, AlertCircle, Clock, Cpu, Zap, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api, type LLMLogItem, type LLMLogDetail, type LLMLogRound } from "@/lib/api";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}K`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60000) return "刚刚";
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}分钟前`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}小时前`;
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function isIntermediateRound(round: LLMLogRound): boolean {
  // A round is "intermediate" (blue) if it contains tool_calls
  if (round.finish_reason === "tool_calls") return true;
  if (round.tool_calls && round.tool_calls.length > 0) return true;
  return false;
}

function RoundPanel({ round, isLast }: { round: LLMLogRound; isLast: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullResponse, setShowFullResponse] = useState(false);

  const usage = round.token_usage;
  const hasTools = round.tool_calls && round.tool_calls.length > 0;
  const intermediate = isIntermediateRound(round);

  // Color: blue for intermediate rounds (with tool calls), green for final rounds (pure text)
  const badgeClass = intermediate
    ? "bg-blue-500/10 text-blue-600"
    : "bg-green-500/10 text-green-600";
  const badgeLabel = intermediate
    ? (round.finish_reason === "tool_calls" ? "tool_calls" : round.finish_reason)
    : round.finish_reason;
  const dotClass = intermediate ? "border-blue-400" : "border-green-400";

  return (
    <div className={`ml-4 border-l-2 ${dotClass} pl-3 py-1`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-sm text-left hover:text-foreground transition py-1"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-medium">{t("aiLog.round", { number: round.round_number })}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{formatDuration(round.duration_ms)}</span>
        {usage && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{formatTokens(usage.total_tokens)} tokens</span>
          </>
        )}
        <span className={`text-xs px-1.5 py-0.5 rounded ${badgeClass}`}>
          {badgeLabel}
        </span>
        {!isLast && intermediate && (
          <span className="text-xs text-muted-foreground">({t("aiLog.intermediate")})</span>
        )}
        {isLast && !intermediate && (
          <span className="text-xs text-muted-foreground">({t("aiLog.finalRound")})</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3 text-sm">
          {/* Prompt */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">{t("aiLog.prompt")}</span>
              <button onClick={() => setShowFullPrompt(!showFullPrompt)} className="text-xs text-primary hover:underline">
                {showFullPrompt ? t("aiLog.showLess") : t("aiLog.showMore")}
              </button>
            </div>
            <pre className={`text-xs overflow-auto whitespace-pre-wrap break-all text-foreground/80 ${showFullPrompt ? "max-h-[600px]" : "max-h-48"}`}>
              {JSON.stringify(round.messages, null, 2)}
            </pre>
          </div>

          {/* Response */}
          {round.response_text && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">{t("aiLog.response")}</span>
                <button onClick={() => setShowFullResponse(!showFullResponse)} className="text-xs text-primary hover:underline">
                  {showFullResponse ? t("aiLog.showLess") : t("aiLog.showMore")}
                </button>
              </div>
              <pre className={`text-xs overflow-auto whitespace-pre-wrap break-all text-foreground/80 ${showFullResponse ? "max-h-[600px]" : "max-h-48"}`}>
                {typeof round.response_text === "string"
                  ? round.response_text
                  : JSON.stringify(round.response_text, null, 2)}
              </pre>
            </div>
          )}

          {/* Tool Calls */}
          {hasTools && (
            <div className="rounded-md border bg-muted/30 p-3">
              <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">{t("aiLog.toolCalls")}</span>
              <div className="mt-2 space-y-1">
                {round.tool_calls.map((tc) => (
                  <div key={tc.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">{tc.name}</span>
                    <span className="text-muted-foreground truncate max-w-[300px]">
                      {typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Token Usage */}
          {usage && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{t("aiLog.inputTokens")}: {formatTokens(usage.input_tokens)}</span>
              <span>{t("aiLog.outputTokens")}: {formatTokens(usage.output_tokens)}</span>
              <span>{t("aiLog.totalTokens")}: {formatTokens(usage.total_tokens)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Delete confirmation dialog */
function DeleteConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean; title?: string; message?: string; onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-card rounded-xl shadow-lg border p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-full bg-destructive/10 p-2">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold">{title || t("aiLog.deleteTitle")}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">{message || t("aiLog.deleteConfirm")}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition"
          >
            {t("aiLog.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition"
          >
            {t("aiLog.delete")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AILog() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LLMLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [detail, setDetail] = useState<LLMLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLogs = () => {
    api.listLLMLogs({ limit: 100 })
      .then(setLogs)
      .catch(() => toast.error(t("error.somethingWentWrong")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const hasRunning = logs.some((l) => l.status === "running");

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (hasRunning) {
      pollRef.current = setInterval(() => {
        api.listLLMLogs({ limit: 100 }).then(setLogs).catch(() => {});
      }, 3000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasRunning]);

  useEffect(() => {
    if (!expandedLog || !detail) return;
    const isRunning = detail.status === "running";
    if (!isRunning) return;
    const interval = setInterval(() => {
      api.getLLMLog(expandedLog).then((d) => {
        setDetail(d);
        if (d.status !== "running") clearInterval(interval);
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [expandedLog, detail?.status]);

  const toggleExpand = (logId: string) => {
    if (expandedLog === logId) {
      setExpandedLog(null);
      setDetail(null);
      return;
    }
    setExpandedLog(logId);
    setDetailLoading(true);
    api.getLLMLog(logId)
      .then(setDetail)
      .catch(() => toast.error(t("error.somethingWentWrong")))
      .finally(() => setDetailLoading(false));
  };

  const requestDelete = (logId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(logId);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteLLMLog(deleteTarget);
      toast.success(t("aiLog.deleted"));
      setLogs((prev) => prev.filter((l) => l.log_id !== deleteTarget));
      if (expandedLog === deleteTarget) { setExpandedLog(null); setDetail(null); }
    } catch {
      toast.error(t("error.somethingWentWrong"));
    } finally {
      setDeleteTarget(null);
    }
  };

  const clearAll = async () => {
    try {
      await api.clearLLMLogs();
      toast.success(t("aiLog.cleared"));
      setLogs([]);
      setExpandedLog(null);
      setDetail(null);
    } catch {
      toast.error(t("error.somethingWentWrong"));
    } finally {
      setClearConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex items-center justify-center min-h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <DeleteConfirmDialog
        open={clearConfirmOpen}
        title={t("aiLog.clearTitle")}
        message={t("aiLog.clearConfirm")}
        onConfirm={clearAll}
        onCancel={() => setClearConfirmOpen(false)}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("aiLog.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("aiLog.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasRunning && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {t("aiLog.autoRefreshing")}
            </span>
          )}
          {logs.length > 0 && (
            <button
              onClick={() => setClearConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("aiLog.clearAll")}
            </button>
          )}
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-48 text-muted-foreground">
          <FileText className="h-12 w-12 mb-3 opacity-30" />
          <p>{t("aiLog.noLogs")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.log_id}
              className="rounded-lg border bg-card shadow-sm"
            >
              <button
                onClick={() => toggleExpand(log.log_id)}
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30 transition"
              >
                {expandedLog === log.log_id ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{log.user_input || "(empty)"}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(log.timestamp)}</span>
                    <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{log.model_name}</span>
                    {log.status !== "running" && (
                      <>
                        <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{formatDuration(log.total_duration_ms)}</span>
                        <span>{formatTokens(log.total_tokens)} tokens</span>
                      </>
                    )}
                    <span>{t("aiLog.rounds", { count: log.round_count })}</span>
                  </div>
                </div>

                {log.status === "running" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("aiLog.running")}
                  </span>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${log.status === "ok" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                    {log.status === "ok" ? t("aiLog.completed") : log.status}
                  </span>
                )}

                {deleteTarget === log.log_id ? (
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmDelete(); }}
                      className="px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded font-medium"
                    >{t("aiLog.confirmDelete")}</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(null); }}
                      className="px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded"
                    >{t("aiLog.cancel")}</button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => requestDelete(log.log_id, e)}
                    className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    title={t("aiLog.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </button>

              {expandedLog === log.log_id && (
                <div className="border-t px-4 pb-4">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : detail ? (
                    <div className="mt-3 space-y-1">
                      {detail.rounds.map((round, i) => (
                        <RoundPanel
                          key={i}
                          round={round}
                          isLast={i === detail.rounds.length - 1}
                        />
                      ))}
                      {detail.status === "running" && (
                        <div className="ml-4 flex items-center gap-2 text-xs text-amber-600 py-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {t("aiLog.inProgress")}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-4 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      Failed to load details
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
