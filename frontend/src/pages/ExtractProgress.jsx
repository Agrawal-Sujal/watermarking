import { useState, useEffect, useRef } from "react";
import API from "../api/api";
import Topbar from "./TopBar";

const STATUS_ORDER = ["pending", "extracting", "completed", "failed"];

function statusIndex(s) {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

// Pipeline steps with progress checkpoints matching extract_watermark.py
const STEPS = [
  { pct: 10,  label: "Load watermarked image",             mono: "resize()" },
  { pct: 25,  label: "Forward pipeline",                   mono: "DTCWT → DCT → SVD" },
  { pct: 45,  label: "Recover watermark SVs",              mono: "Sw′ = (HSw_hat − HSw) / α*" },
  { pct: 60,  label: "ISVD reconstruction",                mono: "Average SVs → single block" },
  { pct: 75,  label: "Henon decryption",                   mono: "Chaotic unscramble" },
  { pct: 88,  label: "Normalise & save",                   mono: "[0, 255] clip" },
  { pct: 100, label: "Complete",                           mono: "DB write-back" },
];

// ── Lazy image loader ──────────────────────────────────────────────────────
function LazyImage({ endpointFn, extractionId, label, large }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    API.get(endpointFn(extractionId), { responseType: "blob" })
      .then((r) => { if (!cancelled) setSrc(URL.createObjectURL(r.data)); })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [endpointFn, extractionId]);

  if (err) return null;
  if (!src) return (
    <div className="vimg-placeholder" style={large ? { height: 80 } : {}}>
      Loading image…
    </div>
  );
  return (
    <div className={`vimg-wrap ${large ? "vimg-wrap--large" : ""}`}>
      <img src={src} alt={label} className="vimg" style={large ? { maxHeight: 260 } : {}} />
      <span className="vimg-label">{label}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ExtractProgress({ extractionId, onReset }) {
  const [exStatus, setExStatus] = useState("pending");
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);
  const [outputUrl, setOutputUrl] = useState(null);
  const pollerRef = useRef(null);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await API.get(
          `watermarking/extract/${extractionId}/status/`
        );
        if (!active) return;

        const { status: s, progress: p, error: e } = res.data;
        setExStatus(s);
        setProgress(p ?? 0);
        if (e) setError(e);

        if (s === "completed") {
          const r = await API.get(
            `watermarking/extract/${extractionId}/result/`
          );
          if (active) setResult(r.data);

          API.get(
            `watermarking/extract/${extractionId}/image/output/`,
            { responseType: "blob" }
          ).then((r) => { if (active) setOutputUrl(URL.createObjectURL(r.data)); })
           .catch(() => {});
        } else if (s !== "failed") {
          pollerRef.current = setTimeout(poll, 1500);
        }
      } catch (_) {
        if (active) pollerRef.current = setTimeout(poll, 3000);
      }
    };

    poll();
    return () => { active = false; clearTimeout(pollerRef.current); };
  }, [extractionId]);

  const isCompleted = exStatus === "completed";
  const isFailed    = exStatus === "failed";
  const isRunning   = exStatus === "extracting" || exStatus === "pending";

  const downloadOutput = () => {
    if (!outputUrl) return;
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `extracted_watermark_${extractionId}.png`;
    a.click();
  };

  return (
    <div className="page">
      <Topbar />

      <div className="pp-layout">

        {/* ══ LEFT — Sticky progress card ══ */}
        <aside className="pp-sidebar">
          <div className="pp-sidebar-inner auth-card reveal">

            <p className="eyebrow">Extraction #{extractionId}</p>
            <h2 style={{ fontSize: "1.35rem", margin: "2px 0 0" }}>
              {isFailed    ? "Failed"
               : isCompleted ? "Extraction Complete ✓"
               : "Extracting…"}
            </h2>

            {isRunning && (
              <p className="subtitle" style={{ fontSize: "0.82rem", marginTop: 6 }}>
                <span className="pp-blink-dot" />
                {exStatus === "pending" ? "Queued" : "Running Algorithm 2…"}
              </p>
            )}

            {/* Progress ring */}
            <div className="pp-ring-wrap">
              <svg width="96" height="96" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" fill="none"
                  stroke="rgba(16,32,38,0.1)" strokeWidth="7" />
                <circle cx="48" cy="48" r="40" fill="none"
                  stroke={isFailed ? "var(--danger)" : "var(--primary)"}
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
                  : "linear-gradient(90deg,var(--primary),#34d399)",
              }} />
            </div>
            <div className="pp-bar-meta">
              <span className="pp-bar-lbl">{exStatus}</span>
              <span className="pp-bar-pct">{progress}%</span>
            </div>

            {/* Mini step list */}
            <div className="pp-mini-steps">
              {STEPS.map((step) => {
                const done   = progress > step.pct;
                const active = progress >= step.pct && !done;
                return (
                  <div key={step.pct}
                    className={`pp-mini-step ${done ? "pp-mini-step--done" : active ? "pp-mini-step--active" : ""}`}>
                    <div className={`pp-mini-dot ${done ? "pp-mini-dot--done" : active ? "pp-mini-dot--active" : ""}`} />
                    <span className="pp-mini-label">{step.label}</span>
                    {active && <span className="pp-mini-badge"><span className="sc-bdot" /></span>}
                    {done && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <path d="M1 3.5L3.5 6L8 1" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Key stats when done */}
            {isCompleted && result && (
              <div className="vd-stats" style={{ marginTop: 14 }}>
                <div className="vd-stat">
                  <span className="vd-stat-lbl">α*</span>
                  <span className="vd-stat-val">{result.alpha_star?.toFixed(6) ?? "—"}</span>
                </div>
                <div className="vd-stat">
                  <span className="vd-stat-lbl">Blocks</span>
                  <span className="vd-stat-val">{result.n_blocks ?? "—"}</span>
                </div>
                <div className="vd-stat">
                  <span className="vd-stat-lbl">SV Length</span>
                  <span className="vd-stat-val">{result.sv_length ?? "—"}</span>
                </div>
                <div className="vd-stat">
                  <span className="vd-stat-lbl">WM Shape</span>
                  <span className="vd-stat-val">
                    {result.watermark_shape ? result.watermark_shape.join(" × ") : "—"}
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

            {/* Download button (completed) */}
            {isCompleted && outputUrl && (
              <div className="pp-dl-section">
                <div className="pp-dl-divider" />
                <p className="eyebrow" style={{ marginBottom: 10 }}>Export</p>
                <div className="pp-dl-thumb">
                  <img src={outputUrl} alt="Extracted watermark preview" />
                  <span className="pp-dl-thumb-lbl">Extracted Watermark</span>
                </div>
                <button className="primary-btn pp-dl-btn" onClick={downloadOutput}>
                  ↓ Download Watermark
                </button>
              </div>
            )}

            <button
              className="ghost-btn"
              onClick={onReset}
              style={{ marginTop: 16, width: "100%", fontSize: "0.82rem" }}
            >
              ← New Extraction
            </button>
          </div>
        </aside>

        {/* ══ RIGHT — Pipeline steps + result ══ */}
        <main className="pp-main">

          {/* ── Running: step-by-step card ── */}
          {(isRunning || isCompleted || isFailed) && (
            <>
              {/* Forward pipeline card */}
              <div className={`sc-card ${isCompleted || isFailed ? "sc-done" : "sc-active"}`}>
                <div className="sc-top">
                  <div className="sc-left">
                    <div className={`sc-num ${isCompleted ? "sc-num--done" : isFailed ? "sc-num--failed" : "sc-num--active"}`}>
                      {isCompleted ? (
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path d="M1 4.5L4.5 8L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : isFailed ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <span className="sc-pulse" />
                      )}
                    </div>
                    <div>
                      <span className="sc-mono">Algorithm 2 · DTCWT-DCT-SVD</span>
                      <h3 className="sc-title">
                        {isCompleted ? "Extraction Pipeline" : isFailed ? "Extraction Failed" : "Running Extraction Pipeline"}
                      </h3>
                    </div>
                  </div>
                  <span className={`sc-badge ${isCompleted ? "sc-badge--done" : isFailed ? "sc-badge--failed" : "sc-badge--active"}`}>
                    {isCompleted
                      ? "Complete"
                      : isFailed
                        ? "Failed"
                        : <><span className="sc-bdot" />Processing</>}
                  </span>
                </div>

                <div className="sc-body">
                  <div className="sc-divider" />
                  {/* Step checklist */}
                  <div className="vr-steps">
                    {STEPS.map((step) => {
                      const done   = progress > step.pct || isCompleted;
                      const active = progress >= step.pct && !done && !isCompleted;
                      return (
                        <div key={step.pct}
                          className={`vr-step ${done ? "vr-step--done" : active ? "vr-step--active" : ""}`}>
                          <div className={`vr-step-dot ${done ? "vr-dot--done" : active ? "vr-dot--active" : ""}`} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span className="vr-step-label">{step.label}</span>
                            <span className="vr-step-mono">{step.mono}</span>
                          </div>
                          {done && (
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none" style={{ flexShrink: 0 }}>
                              <path d="M1 3.5L3.5 6L8 1" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Stats row when complete */}
                  {isCompleted && result && (
                    <>
                      <div className="sc-divider" style={{ marginTop: 14 }} />
                      <div className="sc-stats">
                        <div className="sc-stat">
                          <span className="sc-stat-label">α* (embedding strength)</span>
                          <span className="sc-stat-value">{result.alpha_star?.toFixed(6) ?? "—"}</span>
                        </div>
                        <div className="sc-stat">
                          <span className="sc-stat-label">Blocks processed</span>
                          <span className="sc-stat-value">{result.n_blocks ?? "—"}</span>
                        </div>
                        <div className="sc-stat">
                          <span className="sc-stat-label">SV length</span>
                          <span className="sc-stat-value">{result.sv_length ?? "—"}</span>
                        </div>
                        <div className="sc-stat">
                          <span className="sc-stat-label">WM shape</span>
                          <span className="sc-stat-value">
                            {result.watermark_shape ? result.watermark_shape.join(" × ") : "—"}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Connector ── */}
              {isCompleted && (
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
              )}

              {/* ── Result images card ── */}
              {isCompleted && (
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
                        <h3 className="sc-title">Extracted Watermark</h3>
                      </div>
                    </div>
                    <span className="sc-badge sc-badge--done">Complete</span>
                  </div>

                  <div className="sc-body">
                    <div className="sc-divider" />
                    <div className="vr-images">
                      <LazyImage
                        endpointFn={(id) => `watermarking/extract/${id}/image/input/`}
                        extractionId={extractionId}
                        label="Watermarked Input"
                      />
                      <LazyImage
                        endpointFn={(id) => `watermarking/extract/${id}/image/output/`}
                        extractionId={extractionId}
                        label="Extracted Watermark"
                        large
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <style>{`
        /* ── Layout ── */
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
          display: flex; flex-direction: column; gap: 0;
          padding: clamp(18px,2.5vw,28px);
        }
        .pp-sidebar-inner:hover { transform: none; box-shadow: var(--shadow); }

        .pp-ring-wrap { display: flex; justify-content: center; margin: 16px 0 4px; }

        .pp-bar {
          height: 5px; background: rgba(16,32,38,0.1);
          border-radius: 99px; overflow: hidden; margin-top: 8px;
        }
        .pp-bar-fill {
          height: 100%; border-radius: 99px;
          transition: width 0.7s cubic-bezier(0.4,0,0.2,1);
        }
        .pp-bar-meta { display: flex; justify-content: space-between; margin-top: 5px; }
        .pp-bar-lbl {
          font: 500 0.68rem/1 "DM Mono",monospace;
          letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);
        }
        .pp-bar-pct { font: 600 0.75rem/1 "DM Mono",monospace; color: var(--primary); }

        /* Mini steps */
        .pp-mini-steps {
          display: flex; flex-direction: column; gap: 2px;
          margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px;
        }
        .pp-mini-step {
          display: flex; align-items: center; gap: 8px;
          padding: 5px 6px; border-radius: 7px; transition: background 0.2s;
        }
        .pp-mini-step--done   { background: rgba(15,118,110,0.05); }
        .pp-mini-step--active { background: rgba(15,118,110,0.09); }
        .pp-mini-dot {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
          background: rgba(16,32,38,0.18); transition: all 0.3s;
        }
        .pp-mini-dot--done   { background: var(--primary); opacity: 0.7; }
        .pp-mini-dot--active { background: var(--primary); animation: pp-pulse 1.2s ease-in-out infinite; }
        .pp-mini-label {
          font: 500 0.76rem/1.2 "Space Grotesk",sans-serif;
          color: var(--ink-700); flex: 1; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pp-mini-step--done   .pp-mini-label { color: var(--primary-strong); }
        .pp-mini-step--active .pp-mini-label { color: var(--ink-900); font-weight: 600; }
        .pp-mini-badge { display: flex; align-items: center; }

        /* Download section */
        .pp-dl-section { margin-top: 4px; }
        .pp-dl-divider { height: 1px; background: var(--line); margin: 16px 0 14px; }
        .pp-dl-thumb {
          border-radius: 10px; overflow: hidden; border: 1px solid var(--line);
          margin-bottom: 12px; box-shadow: 0 3px 12px rgba(11,38,46,0.08);
        }
        .pp-dl-thumb img { width: 100%; display: block; max-height: 130px; object-fit: cover; }
        .pp-dl-thumb-lbl {
          display: block; padding: 5px 10px; background: rgba(247,244,238,0.95);
          font: 500 0.65rem/1 "DM Mono",monospace; color: var(--ink-500);
          letter-spacing: 0.07em; text-transform: uppercase;
        }
        .pp-dl-btn {
          width: 100%; margin-top: 0 !important;
          font-size: 0.84rem !important; padding: 10px 8px !important;
        }

        /* Sidebar stat chips */
        .vd-stats {
          display: flex; flex-wrap: wrap; gap: 6px;
          border-top: 1px solid var(--line); padding-top: 12px;
        }
        .vd-stat {
          flex: 1 1 calc(50% - 3px); min-width: 0;
          display: flex; flex-direction: column; gap: 2px;
          background: rgba(15,118,110,0.05); border: 1px solid rgba(15,118,110,0.12);
          border-radius: 8px; padding: 6px 8px;
        }
        .vd-stat-lbl {
          font: 500 0.62rem/1 "DM Mono",monospace;
          text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-500);
        }
        .vd-stat-val { font: 600 0.84rem/1.3 "DM Mono",monospace; color: var(--primary-strong); }

        /* Blink dot */
        .pp-blink-dot {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          background: var(--primary); margin-right: 6px; vertical-align: middle;
          animation: pp-blink 1.1s ease-in-out infinite;
        }

        .pp-main { display: flex; flex-direction: column; padding-top: 4px; }

        /* ── Step cards ── */
        .sc-card {
          border-radius: var(--radius-lg); border: 1px solid var(--line);
          background: var(--card); backdrop-filter: blur(8px); padding: 16px 18px;
          transition: box-shadow 0.25s, border-color 0.25s, transform 0.2s;
        }
        .sc-card:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(11,38,46,0.09); }
        .sc-done   { border-color: rgba(15,118,110,0.22); background: rgba(255,255,255,0.92); }
        .sc-active {
          border-color: rgba(15,118,110,0.45); background: rgba(255,255,255,0.98);
          box-shadow: 0 0 0 3px rgba(15,118,110,0.08), 0 6px 20px rgba(11,38,46,0.1);
        }

        .sc-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .sc-left { display: flex; align-items: center; gap: 12px; }

        .sc-num {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; transition: all 0.3s;
        }
        .sc-num--done   { background: rgba(15,118,110,0.12); border: 1.5px solid var(--primary); color: var(--primary); }
        .sc-num--active { background: rgba(15,118,110,0.07); border: 1.5px solid var(--primary); box-shadow: 0 0 0 4px rgba(15,118,110,0.1); }
        .sc-num--failed { background: rgba(239,68,68,0.1); border: 1.5px solid #ef4444; color: #dc2626; }

        .sc-pulse {
          display: block; width: 9px; height: 9px; border-radius: 50%;
          background: var(--primary); animation: pp-pulse 1.2s ease-in-out infinite;
        }

        .sc-mono {
          display: block; font: 500 0.67rem/1 "DM Mono",monospace;
          letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500); margin-bottom: 2px;
        }
        .sc-title { margin: 0; font: 600 0.96rem/1.2 "Space Grotesk",sans-serif; color: var(--ink-900); }

        .sc-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 99px;
          font: 500 0.67rem/1 "DM Mono",monospace; letter-spacing: 0.05em; white-space: nowrap;
        }
        .sc-badge--active { background: rgba(15,118,110,0.1); border: 1px solid rgba(15,118,110,0.3); color: var(--primary-strong); }
        .sc-badge--done   { background: rgba(15,118,110,0.07); border: 1px solid rgba(15,118,110,0.18); color: var(--primary); }
        .sc-badge--failed { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); color: #dc2626; }

        .sc-bdot {
          display: block; width: 5px; height: 5px; border-radius: 50%;
          background: var(--primary); animation: pp-blink 1s ease-in-out infinite;
        }

        .sc-body  { margin-top: 12px; }
        .sc-divider { height: 1px; background: var(--line); margin-bottom: 12px; }

        .sc-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .sc-stat {
          display: flex; flex-direction: column; gap: 2px;
          background: rgba(15,118,110,0.05); border: 1px solid rgba(15,118,110,0.12);
          border-radius: 8px; padding: 6px 10px; min-width: 80px;
        }
        .sc-stat-label {
          font: 500 0.64rem/1 "DM Mono",monospace;
          text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-500);
        }
        .sc-stat-value { font: 600 0.86rem/1.3 "DM Mono",monospace; color: var(--primary-strong); }

        /* Step checklist */
        .vr-steps { display: flex; flex-direction: column; gap: 3px; }
        .vr-step {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 6px; border-radius: 7px;
        }
        .vr-step--done   { background: rgba(15,118,110,0.05); }
        .vr-step--active { background: rgba(15,118,110,0.09); }
        .vr-step-dot {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
          background: rgba(16,32,38,0.18); transition: all 0.3s;
        }
        .vr-dot--done   { background: var(--primary); opacity: 0.7; }
        .vr-dot--active { background: var(--primary); animation: pp-pulse 1.2s ease-in-out infinite; }
        .vr-step-label {
          display: block;
          font: 500 0.76rem/1.2 "Space Grotesk",sans-serif; color: var(--ink-700);
        }
        .vr-step--done   .vr-step-label { color: var(--primary-strong); }
        .vr-step--active .vr-step-label { color: var(--ink-900); font-weight: 600; }
        .vr-step-mono {
          display: block;
          font: 500 0.64rem/1.3 "DM Mono",monospace;
          color: var(--ink-400, #9ca3af); letter-spacing: 0.06em;
        }

        /* Images */
        .vr-images { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
        .vimg-wrap {
          border-radius: 10px; overflow: hidden; border: 1px solid var(--line);
          flex: 1 1 160px; max-width: 220px; box-shadow: 0 3px 10px rgba(11,38,46,0.07);
        }
        .vimg-wrap--large { max-width: 320px; flex: 2 1 200px; }
        .vimg { width: 100%; display: block; max-height: 160px; object-fit: contain; background: rgba(16,32,38,0.03); }
        .vimg-label {
          display: block; padding: 5px 10px; background: rgba(247,244,238,0.95);
          font: 500 0.66rem/1 "DM Mono",monospace; color: var(--ink-500);
          letter-spacing: 0.07em; text-transform: uppercase;
        }
        .vimg-placeholder {
          flex: 1 1 160px; max-width: 220px; height: 50px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(16,32,38,0.03); border: 1px dashed var(--line);
          border-radius: 8px; font: 500 0.75rem/1 "DM Mono",monospace; color: var(--ink-500);
        }

        /* Connectors */
        .sc-connector { display: flex; justify-content: center; height: 32px; align-items: stretch; }
        .sc-conn-line { display: flex; flex-direction: column; align-items: center; color: var(--line); }
        .sc-conn-line--done { color: var(--primary); opacity: 0.45; }
        .sc-conn-dot   { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
        .sc-conn-shaft { width: 1.5px; flex: 1; background: currentColor; }
        .sc-conn-arrow { flex-shrink: 0; margin-top: -2px; }

        /* Animations */
        @keyframes pp-pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.6); opacity: 0.35; }
        }
        @keyframes pp-blink {
          0%,100% { opacity: 1; }
          50% { opacity: 0.15; }
        }

        /* Mobile */
        @media (max-width: 760px) {
          .pp-layout { grid-template-columns: 1fr; padding: 16px 14px 60px; gap: 16px; }
          .pp-sidebar { position: static; }
          .vr-images { flex-direction: column; }
          .vimg-wrap, .vimg-wrap--large { max-width: 100%; }
        }
      `}</style>
    </div>
  );
}