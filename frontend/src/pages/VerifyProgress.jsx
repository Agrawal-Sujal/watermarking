import { useState, useEffect, useRef, useCallback } from "react";
import API from "../api/api";
import Topbar from "./TopBar";

// ── Status machine ─────────────────────────────────────────────────────────
const STATUS_ORDER = ["pending", "verifying", "completed", "failed"];

function statusIndex(s) {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

// ── Verdict palette helpers ─────────────────────────────────────────────────
function verdictMeta(isTampered) {
  if (isTampered === null || isTampered === undefined)
    return { label: "Analysing…", cls: "vd-pending", icon: null };
  if (isTampered)
    return { label: "Tampered", cls: "vd-tampered", icon: "⚠" };
  return { label: "Authentic", cls: "vd-authentic", icon: "✓" };
}

// ── Lazy image loader ──────────────────────────────────────────────────────
function LazyImage({ endpoint, verificationId, label }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    API.get(endpoint(verificationId), { responseType: "blob" })
      .then((r) => { if (!cancelled) setSrc(URL.createObjectURL(r.data)); })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [endpoint, verificationId]);

  if (err) return null;
  if (!src) return <div className="vimg-placeholder">Loading image…</div>;
  return (
    <div className="vimg-wrap">
      <img src={src} alt={label} className="vimg" />
      <span className="vimg-label">{label}</span>
    </div>
  );
}

// ── Grid heatmap ────────────────────────────────────────────────────────────
function TamperGrid({ flat, rows, cols, deltas }) {
  if (!flat || !rows || !cols) return null;

  const MAX_CELLS = 64 * 64;
  const total = rows * cols;
  if (total > MAX_CELLS) return null;

  const maxDelta = deltas ? Math.max(...deltas) : 1;

  return (
    <div className="tg-wrap">
      <p className="tg-caption">Block tamper grid — red = tampered · green = authentic</p>
      <div
        className="tg-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {flat.map((val, i) => {
          const delta = deltas ? deltas[i] : 0;
          const intensity = maxDelta > 0 ? delta / maxDelta : 0;
          const bg = val
            ? `rgba(239,68,68,${0.4 + intensity * 0.6})`
            : `rgba(34,197,94,${0.25 + (1 - intensity) * 0.2})`;
          return (
            <div
              key={i}
              className="tg-cell"
              title={`Block ${i} · delta ${deltas ? deltas[i].toFixed(4) : "—"}`}
              style={{ background: bg }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function VerifyProgress({ verificationId, onReset }) {
  const [verifyStatus, setVerifyStatus]   = useState("pending");
  const [progress, setProgress]           = useState(0);
  const [error, setError]                 = useState(null);
  const [result, setResult]               = useState(null);
  const pollerRef = useRef(null);

  // ── Poll status ──────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await API.get(
          `watermarking/verify/${verificationId}/status/`
        );
        if (!active) return;

        const { status: s, progress: p, error: e } = res.data;
        setVerifyStatus(s);
        setProgress(p ?? 0);
        if (e) setError(e);

        if (s === "completed") {
          // fetch full result
          const r = await API.get(
            `watermarking/verify/${verificationId}/result/`
          );
          if (active) setResult(r.data);
        } else if (s !== "failed") {
          pollerRef.current = setTimeout(poll, 1500);
        }
      } catch (_) {
        if (active) pollerRef.current = setTimeout(poll, 3000);
      }
    };

    poll();
    return () => { active = false; clearTimeout(pollerRef.current); };
  }, [verificationId]);

  const isCompleted = verifyStatus === "completed";
  const isFailed    = verifyStatus === "failed";
  const isVerifying = verifyStatus === "verifying";
  const isPending   = verifyStatus === "pending";

  const verdict = verdictMeta(result?.is_tampered);
  const tamperedPct = result
    ? (result.tampered_frac * 100).toFixed(1)
    : null;

  return (
    <div className="page">
      <Topbar />

      <div className="pp-layout">

        {/* ══ LEFT — Sticky status card ══ */}
        <aside className="pp-sidebar">
          <div className="pp-sidebar-inner auth-card reveal">

            <p className="eyebrow">Verification #{verificationId}</p>
            <h2 style={{ fontSize: "1.35rem", margin: "2px 0 0" }}>
              {isFailed    ? "Failed"
               : isCompleted ? "Analysis Complete ✓"
               : "Analysing…"}
            </h2>

            {(isPending || isVerifying) && (
              <p className="subtitle" style={{ fontSize: "0.82rem", marginTop: 6 }}>
                <span className="pp-blink-dot" />
                {isPending ? "Queued" : "Running SV comparison…"}
              </p>
            )}

            {/* Progress ring */}
            <div className="pp-ring-wrap">
              <svg width="96" height="96" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" fill="none"
                  stroke="rgba(16,32,38,0.1)" strokeWidth="7" />
                <circle cx="48" cy="48" r="40" fill="none"
                  stroke={
                    isFailed    ? "var(--danger)"
                    : isCompleted && result?.is_tampered
                      ? "#ef4444"
                      : "var(--primary)"
                  }
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - progress / 100)}`}
                  transform="rotate(-90 48 48)"
                  style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)" }}
                />
                <text x="48" y="44" textAnchor="middle"
                  style={{ font: "700 1.25rem 'Space Grotesk',sans-serif", fill: "var(--ink-900)" }}>
                  {progress}%
                </text>
                <text x="48" y="60" textAnchor="middle"
                  style={{ font: "500 0.65rem 'DM Mono',monospace", fill: "var(--ink-500)", letterSpacing: "0.06em" }}>
                  DONE
                </text>
              </svg>
            </div>

            {/* Progress bar */}
            <div className="pp-bar">
              <div className="pp-bar-fill" style={{
                width: `${progress}%`,
                background: isFailed
                  ? "linear-gradient(90deg,var(--danger),#f87171)"
                  : isCompleted && result?.is_tampered
                    ? "linear-gradient(90deg,#ef4444,#f87171)"
                    : "linear-gradient(90deg,var(--primary),#34d399)",
              }} />
            </div>
            <div className="pp-bar-meta">
              <span className="pp-bar-lbl">{verifyStatus}</span>
              <span className="pp-bar-pct">{progress}%</span>
            </div>

            {/* Verdict badge (only when done) */}
            {isCompleted && result && (
              <div className={`vd-badge ${verdict.cls}`} style={{ marginTop: 16 }}>
                {verdict.icon && <span className="vd-icon">{verdict.icon}</span>}
                <span className="vd-label">{verdict.label}</span>
                {tamperedPct !== null && (
                  <span className="vd-frac">
                    {tamperedPct}% blocks affected
                  </span>
                )}
              </div>
            )}

            {/* Key stats */}
            {isCompleted && result && (
              <div className="vd-stats" style={{ marginTop: 14 }}>
                <div className="vd-stat">
                  <span className="vd-stat-lbl">Threshold</span>
                  <span className="vd-stat-val">
                    {result.tamper_threshold_used?.toFixed(4) ?? "—"}
                  </span>
                </div>
                <div className="vd-stat">
                  <span className="vd-stat-lbl">Grid</span>
                  <span className="vd-stat-val">
                    {result.grid_rows ?? "—"} × {result.grid_cols ?? "—"}
                  </span>
                </div>
                <div className="vd-stat">
                  <span className="vd-stat-lbl">Blocks</span>
                  <span className="vd-stat-val">
                    {result.grid_rows && result.grid_cols
                      ? result.grid_rows * result.grid_cols
                      : "—"}
                  </span>
                </div>
                <div className="vd-stat">
                  <span className="vd-stat-lbl">Source #</span>
                  <span className="vd-stat-val">
                    {result.source_process_id ?? "—"}
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {isFailed && error && (
              <div className="status error" style={{ marginTop: 14, fontSize: "0.8rem" }}>
                {error}
              </div>
            )}

            {/* Back / Reset */}
            <button
              className={isCompleted ? "ghost-btn" : "ghost-btn"}
              onClick={onReset}
              style={{ marginTop: 18, width: "100%", fontSize: "0.82rem" }}
            >
              ← New Verification
            </button>
          </div>
        </aside>

        {/* ══ RIGHT — Results panel ══ */}
        <main className="pp-main">

          {/* ── While running ── */}
          {!isCompleted && !isFailed && (
            <div className="vr-waiting sc-card sc-active">
              <div className="sc-top">
                <div className="sc-left">
                  <div className="sc-num sc-num--active">
                    <span className="sc-pulse" />
                  </div>
                  <div>
                    <span className="sc-mono">SV-Distance · Tamper Detection</span>
                    <h3 className="sc-title">Running Verification Pipeline</h3>
                  </div>
                </div>
                <span className="sc-badge sc-badge--active">
                  <span className="sc-bdot" />Processing
                </span>
              </div>

              <div className="sc-body">
                <div className="sc-divider" />
                <div className="vr-steps">
                  {[
                    { pct: 10,  label: "Load received image" },
                    { pct: 25,  label: "Forward pipeline (DTCWT → DCT → SVD)" },
                    { pct: 45,  label: "Compute per-block SV deltas" },
                    { pct: 65,  label: "Generate tamper map & overlay" },
                    { pct: 90,  label: "Persist results" },
                    { pct: 100, label: "Complete" },
                  ].map((step) => {
                    const done   = progress > step.pct;
                    const active = progress >= step.pct && !done;
                    return (
                      <div key={step.pct} className={`vr-step ${done ? "vr-step--done" : active ? "vr-step--active" : ""}`}>
                        <div className={`vr-step-dot ${done ? "vr-dot--done" : active ? "vr-dot--active" : ""}`} />
                        <span className="vr-step-label">{step.label}</span>
                        {done && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
                            <path d="M1 3.5L3.5 6L8 1" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Failed ── */}
          {isFailed && (
            <div className="sc-card" style={{ borderColor: "rgba(239,68,68,0.4)" }}>
              <div className="sc-top">
                <div className="sc-left">
                  <div className="sc-num" style={{ borderColor: "#ef4444", color: "#ef4444" }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <span className="sc-mono">Error</span>
                    <h3 className="sc-title">Verification Failed</h3>
                  </div>
                </div>
                <span className="sc-badge" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#dc2626" }}>
                  Failed
                </span>
              </div>
              {error && (
                <div className="sc-body">
                  <div className="sc-divider" />
                  <p style={{ margin: 0, font: "500 0.82rem/1.6 'DM Mono',monospace", color: "#dc2626" }}>
                    {error}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Completed: Verdict card ── */}
          {isCompleted && result && (
            <>
              <div className={`sc-card sc-done vr-verdict-card ${result.is_tampered ? "vr-verdict--tampered" : "vr-verdict--authentic"}`}>
                <div className="sc-top">
                  <div className="sc-left">
                    <div className={`sc-num ${result.is_tampered ? "vr-num--tampered" : "sc-num--done"}`}>
                      {result.is_tampered ? (
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M6.5 2v5M6.5 10v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path d="M1 4.5L4.5 8L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <span className="sc-mono">
                        {result.is_tampered ? "Integrity Violation Detected" : "Integrity Verified"}
                      </span>
                      <h3 className="sc-title" style={{
                        color: result.is_tampered ? "#dc2626" : "var(--primary-strong)"
                      }}>
                        {result.is_tampered ? "Image Has Been Tampered" : "Image Is Authentic"}
                      </h3>
                    </div>
                  </div>
                  <span className={`sc-badge ${result.is_tampered ? "sc-badge--tampered" : "sc-badge--done"}`}>
                    {result.is_tampered
                      ? <><span className="sc-bdot" style={{ background: "#ef4444" }} />Tampered</>
                      : "Authentic"}
                  </span>
                </div>

                <div className="sc-body">
                  <div className="sc-divider" />
                  <div className="sc-stats">
                    <div className="sc-stat">
                      <span className="sc-stat-label">Tampered Blocks</span>
                      <span className="sc-stat-value" style={{ color: result.is_tampered ? "#dc2626" : "var(--primary-strong)" }}>
                        {tamperedPct}%
                      </span>
                    </div>
                    <div className="sc-stat">
                      <span className="sc-stat-label">Threshold T</span>
                      <span className="sc-stat-value">
                        {result.tamper_threshold_used?.toFixed(4)}
                      </span>
                    </div>
                    <div className="sc-stat">
                      <span className="sc-stat-label">Grid Size</span>
                      <span className="sc-stat-value">
                        {result.grid_rows} × {result.grid_cols}
                      </span>
                    </div>
                    <div className="sc-stat">
                      <span className="sc-stat-label">Total Blocks</span>
                      <span className="sc-stat-value">
                        {result.grid_rows * result.grid_cols}
                      </span>
                    </div>
                  </div>

                  {/* Block heatmap grid */}
                  <TamperGrid
                    flat={result.tamper_grid_flat}
                    rows={result.grid_rows}
                    cols={result.grid_cols}
                    deltas={result.sv_deltas_flat}
                  />
                </div>
              </div>

              {/* ── Connector ── */}
              <div className="sc-connector">
                <div className="sc-conn-line sc-conn-line--done">
                  <div className="sc-conn-dot" />
                  <div className="sc-conn-shaft" />
                  <div className="sc-conn-arrow">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 1L5 7L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* ── Image results card ── */}
              <div className="sc-card sc-done">
                <div className="sc-top">
                  <div className="sc-left">
                    <div className="sc-num sc-num--done">
                      <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                        <path d="M1 4.5L4.5 8L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <span className="sc-mono">Visual Output</span>
                      <h3 className="sc-title">Generated Images</h3>
                    </div>
                  </div>
                  <span className="sc-badge sc-badge--done">Complete</span>
                </div>

                <div className="sc-body">
                  <div className="sc-divider" />
                  <div className="vr-images">
                    <LazyImage
                      endpoint={(id) => `watermarking/verify/${id}/image/received/`}
                      verificationId={verificationId}
                      label="Received Image"
                    />
                    <LazyImage
                      endpoint={(id) => `watermarking/verify/${id}/image/tamper_map/`}
                      verificationId={verificationId}
                      label="Tamper Map"
                    />
                    <LazyImage
                      endpoint={(id) => `watermarking/verify/${id}/image/overlay/`}
                      verificationId={verificationId}
                      label="Overlay"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <style>{`
        /* ── Layout (shared with PipelineProgress) ── */
        .pp-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          align-items: start;
          max-width: 1020px;
          margin: 0 auto;
          padding: 28px 24px 80px;
          min-height: calc(100vh - 57px);
          box-sizing: border-box;
        }

        .pp-sidebar { position: sticky; top: 24px; align-self: start; }
        .pp-sidebar-inner {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: clamp(18px,2.5vw,28px);
        }
        .pp-sidebar-inner:hover { transform: none; box-shadow: var(--shadow); }

        .pp-ring-wrap { display: flex; justify-content: center; margin: 16px 0 4px; }

        .pp-bar {
          height: 5px;
          background: rgba(16,32,38,0.1);
          border-radius: 99px;
          overflow: hidden;
          margin-top: 8px;
        }
        .pp-bar-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 0.7s cubic-bezier(0.4,0,0.2,1);
        }
        .pp-bar-meta {
          display: flex;
          justify-content: space-between;
          margin-top: 5px;
        }
        .pp-bar-lbl {
          font: 500 0.68rem/1 "DM Mono",monospace;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-500);
        }
        .pp-bar-pct { font: 600 0.75rem/1 "DM Mono",monospace; color: var(--primary); }

        .pp-blink-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--primary);
          margin-right: 6px;
          vertical-align: middle;
          animation: pp-blink 1.1s ease-in-out infinite;
        }

        .pp-main { display: flex; flex-direction: column; padding-top: 4px; }

        /* ── Verdict badge ── */
        .vd-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 12px 10px;
          border-radius: 12px;
          border: 1.5px solid;
        }
        .vd-tampered  { background: rgba(239,68,68,0.07); border-color: rgba(239,68,68,0.3); }
        .vd-authentic { background: rgba(15,118,110,0.07); border-color: rgba(15,118,110,0.3); }
        .vd-pending   { background: rgba(16,32,38,0.04); border-color: var(--line); }

        .vd-icon  { font-size: 1.4rem; line-height: 1; }
        .vd-label { font: 700 1rem/1 "Space Grotesk",sans-serif; color: var(--ink-900); }
        .vd-tampered  .vd-label { color: #dc2626; }
        .vd-authentic .vd-label { color: var(--primary-strong); }
        .vd-frac  { font: 500 0.72rem/1 "DM Mono",monospace; color: var(--ink-500); }

        /* ── Sidebar stats ── */
        .vd-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          border-top: 1px solid var(--line);
          padding-top: 12px;
          margin-top: 2px;
        }
        .vd-stat {
          flex: 1 1 calc(50% - 3px);
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: rgba(15,118,110,0.05);
          border: 1px solid rgba(15,118,110,0.12);
          border-radius: 8px;
          padding: 6px 8px;
        }
        .vd-stat-lbl {
          font: 500 0.62rem/1 "DM Mono",monospace;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-500);
        }
        .vd-stat-val {
          font: 600 0.84rem/1.3 "DM Mono",monospace;
          color: var(--primary-strong);
        }

        /* ── Step cards (shared classes from PipelineProgress) ── */
        .sc-wrapper { display: flex; flex-direction: column; }

        .sc-card {
          border-radius: var(--radius-lg);
          border: 1px solid var(--line);
          background: var(--card);
          backdrop-filter: blur(8px);
          padding: 16px 18px;
          transition: box-shadow 0.25s ease, border-color 0.25s ease, transform 0.2s ease;
        }
        .sc-card:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(11,38,46,0.09); }
        .sc-done   { border-color: rgba(15,118,110,0.22); background: rgba(255,255,255,0.92); }
        .sc-active {
          border-color: rgba(15,118,110,0.45);
          background: rgba(255,255,255,0.98);
          box-shadow: 0 0 0 3px rgba(15,118,110,0.08), 0 6px 20px rgba(11,38,46,0.1);
        }

        .sc-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .sc-left { display: flex; align-items: center; gap: 12px; }

        .sc-num {
          width: 30px; height: 30px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
        }
        .sc-num--done   { background: rgba(15,118,110,0.12); border: 1.5px solid var(--primary); color: var(--primary); }
        .sc-num--active { background: rgba(15,118,110,0.07); border: 1.5px solid var(--primary); box-shadow: 0 0 0 4px rgba(15,118,110,0.1); }
        .vr-num--tampered { background: rgba(239,68,68,0.1); border: 1.5px solid #ef4444; color: #dc2626; }

        .sc-pulse {
          display: block;
          width: 9px; height: 9px;
          border-radius: 50%;
          background: var(--primary);
          animation: pp-pulse 1.2s ease-in-out infinite;
        }

        .sc-mono {
          display: block;
          font: 500 0.67rem/1 "DM Mono",monospace;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-500);
          margin-bottom: 2px;
        }
        .sc-title {
          margin: 0;
          font: 600 0.96rem/1.2 "Space Grotesk",sans-serif;
          color: var(--ink-900);
        }

        .sc-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 99px;
          font: 500 0.67rem/1 "DM Mono",monospace;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }
        .sc-badge--active   { background: rgba(15,118,110,0.1); border: 1px solid rgba(15,118,110,0.3); color: var(--primary-strong); }
        .sc-badge--done     { background: rgba(15,118,110,0.07); border: 1px solid rgba(15,118,110,0.18); color: var(--primary); }
        .sc-badge--tampered { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); color: #dc2626; }

        .sc-bdot {
          display: block;
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--primary);
          animation: pp-blink 1s ease-in-out infinite;
        }

        .sc-body  { margin-top: 12px; }
        .sc-divider { height: 1px; background: var(--line); margin-bottom: 12px; }

        .sc-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 10px;
        }
        .sc-stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: rgba(15,118,110,0.05);
          border: 1px solid rgba(15,118,110,0.12);
          border-radius: 8px;
          padding: 6px 10px;
          min-width: 80px;
        }
        .sc-stat-label {
          font: 500 0.64rem/1 "DM Mono",monospace;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-500);
        }
        .sc-stat-value {
          font: 600 0.86rem/1.3 "DM Mono",monospace;
          color: var(--primary-strong);
        }

        /* ── Verdict card colour variants ── */
        .vr-verdict--tampered {
          border-color: rgba(239,68,68,0.35) !important;
          background: rgba(254,242,242,0.6) !important;
        }
        .vr-verdict--authentic {
          border-color: rgba(15,118,110,0.3) !important;
          background: rgba(240,253,244,0.6) !important;
        }

        /* ── Inline step list (while running) ── */
        .vr-steps {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .vr-step {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 6px;
          border-radius: 7px;
        }
        .vr-step--done   { background: rgba(15,118,110,0.05); }
        .vr-step--active { background: rgba(15,118,110,0.09); }

        .vr-step-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          background: rgba(16,32,38,0.18);
          transition: all 0.3s;
        }
        .vr-dot--done   { background: var(--primary); opacity: 0.7; }
        .vr-dot--active { background: var(--primary); animation: pp-pulse 1.2s ease-in-out infinite; }

        .vr-step-label {
          font: 500 0.76rem/1.2 "Space Grotesk",sans-serif;
          color: var(--ink-700);
          flex: 1;
        }
        .vr-step--done   .vr-step-label { color: var(--primary-strong); }
        .vr-step--active .vr-step-label { color: var(--ink-900); font-weight: 600; }

        /* ── Waiting card (full card for running state) ── */
        .vr-waiting { margin-bottom: 0; }

        /* ── Image row ── */
        .vr-images {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 4px;
        }
        .vimg-wrap {
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--line);
          flex: 1 1 160px;
          max-width: 220px;
          box-shadow: 0 3px 10px rgba(11,38,46,0.07);
        }
        .vimg { width: 100%; display: block; max-height: 160px; object-fit: cover; }
        .vimg-label {
          display: block;
          padding: 5px 10px;
          background: rgba(247,244,238,0.95);
          font: 500 0.66rem/1 "DM Mono",monospace;
          color: var(--ink-500);
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }
        .vimg-placeholder {
          flex: 1 1 160px;
          max-width: 220px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(16,32,38,0.03);
          border: 1px dashed var(--line);
          border-radius: 8px;
          font: 500 0.75rem/1 "DM Mono",monospace;
          color: var(--ink-500);
        }

        /* ── Block heatmap ── */
        .tg-wrap { margin-top: 14px; }
        .tg-caption {
          font: 500 0.7rem/1 "DM Mono",monospace;
          color: var(--ink-500);
          margin: 0 0 8px;
          letter-spacing: 0.05em;
        }
        .tg-grid {
          display: grid;
          gap: 1.5px;
          width: 100%;
          max-width: 440px;
        }
        .tg-cell {
          aspect-ratio: 1;
          border-radius: 2px;
          transition: opacity 0.2s;
          cursor: default;
        }
        .tg-cell:hover { opacity: 0.7; }

        /* ── Connectors (from PipelineProgress) ── */
        .sc-connector { display: flex; justify-content: center; height: 32px; align-items: stretch; }
        .sc-conn-line { display: flex; flex-direction: column; align-items: center; color: var(--line); transition: color 0.4s; }
        .sc-conn-line--done { color: var(--primary); opacity: 0.45; }
        .sc-conn-dot   { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .sc-conn-shaft { width: 1.5px; flex: 1; background: currentColor; }
        .sc-conn-arrow { flex-shrink: 0; margin-top: -2px; }

        /* ── Animations ── */
        @keyframes pp-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.6); opacity: 0.35; }
        }
        @keyframes pp-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }

        /* ── Mobile ── */
        @media (max-width: 760px) {
          .pp-layout {
            grid-template-columns: 1fr;
            padding: 16px 14px 60px;
            gap: 16px;
          }
          .pp-sidebar { position: static; }
          .vr-images { flex-direction: column; }
          .vimg-wrap { max-width: 100%; }
        }
      `}</style>
    </div>
  );
}