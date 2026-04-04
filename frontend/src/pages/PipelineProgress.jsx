import { useState, useEffect, useRef, useCallback } from "react";
import API from "../api/api";
import Topbar from "./TopBar";

const STEPS = [
  {
    key: "resizing",
    status: "resizing",
    label: "Resize Image",
    mono: "DTCWT · Padding",
    endpoint: (id) => `watermarking/process/${id}/resizing/`,
    imageEndpoint: (id) => `watermarking/process/${id}/image/resized/`,
    hasImage: true,
    renderData: (d) => [{ label: "DTCWT Levels", value: d.dtcwt_levels }],
  },
  {
    key: "forwarding",
    status: "forwarding",
    label: "Forward Pipeline",
    mono: "DTCWT → DCT → SVD",
    endpoint: (id) => `watermarking/process/${id}/forward/`,
    hasImage: false,
    renderData: (d) => [
      { label: "Blocks", value: d.n_blocks },
      { label: "SV Length", value: d.sv_length },
      { label: "LL Shape", value: d.LL_shape ? `${d.LL_shape[0]} × ${d.LL_shape[1]}` : "—" },
    ],
  },
  {
    key: "encryption",
    status: "encrypting",
    label: "Henon Encryption",
    mono: "Chaotic Scrambling",
    endpoint: (id) => `watermarking/process/${id}/encryption/`,
    imageEndpoint: (id) => `watermarking/process/${id}/image/wm_encrypted/`,
    hasImage: true,
    renderData: (d) => [
      { label: "Henon a", value: d.henon_a?.toFixed(4) },
      { label: "Henon b", value: d.henon_b?.toFixed(4) },
      { label: "WM Shape", value: d.watermark_shape ? d.watermark_shape.join(" × ") : "—" },
    ],
  },
  {
    key: "svd",
    status: "svd",
    label: "SVD Decomposition",
    mono: "Singular Value Decomp.",
    endpoint: (id) => `watermarking/process/${id}/svd/`,
    hasImage: false,
    renderData: () => [{ label: "Operation", value: "Applied on watermark" }],
  },
  {
    key: "pso",
    status: "pso",
    label: "PSO Optimisation",
    mono: "Particle Swarm",
    endpoint: (id) => `watermarking/process/${id}/pso/`,
    hasImage: false,
    renderData: (d) => [
      { label: "α*", value: d.alpha_star?.toFixed(6) },
      { label: "PSO Cost", value: d.pso_cost?.toFixed(6) },
      { label: "Particles", value: d.pso_particles },
      { label: "Iterations", value: d.pso_iterations },
    ],
  },
  {
    key: "embedding",
    status: "embedding",
    label: "Embed Watermark",
    mono: "IDCT → IDTCWT",
    endpoint: (id) => `watermarking/process/${id}/embedding/`,
    imageEndpoint: (id) => `watermarking/process/${id}/image/output/`,
    hasImage: true,
    renderData: (d) => [
      { label: "PSNR", value: d.psnr_value ? `${d.psnr_value.toFixed(2)} dB` : "—" },
    ],
  },
  {
    key: "threshold",
    status: "thresholding",
    label: "Compute Threshold",
    mono: "Tamper Detection",
    endpoint: (id) => `watermarking/process/${id}/threshold/`,
    hasImage: false,
    renderData: (d) => [
      { label: "Max Drift", value: d.max_benign_drift?.toFixed(6) },
      { label: "Auto Thresh.", value: d.auto_threshold?.toFixed(6) },
      { label: "Final Thresh.", value: d.final_threshold?.toFixed(6) },
    ],
  },
];

const STATUS_ORDER = [
  "pending", "resizing", "forwarding", "encrypting",
  "svd", "pso", "embedding", "thresholding", "completed",
];

function statusIndex(s) {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

function StepImage({ endpoint, processId, label }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancelled = false;
    API.get(endpoint(processId), { responseType: "blob" })
      .then((r) => { if (!cancelled) setSrc(URL.createObjectURL(r.data)); })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [endpoint, processId]);
  if (err) return null;
  if (!src) return <div className="simg-placeholder">Loading image…</div>;
  return (
    <div className="simg-wrap">
      <img src={src} alt={label} className="simg" />
      <span className="simg-label">{label}</span>
    </div>
  );
}

function StepCard({ step, index, processId, currentStatus, stepData, isLast }) {
  const curIdx  = statusIndex(currentStatus);
  const stepIdx = STATUS_ORDER.indexOf(step.status);
  const isDone    = curIdx > stepIdx;
  const isActive  = currentStatus === step.status;
  const isPending = !isDone && !isActive;

  return (
    <div className="sc-wrapper">
      <div className={`sc-card ${isDone ? "sc-done" : ""} ${isActive ? "sc-active" : ""} ${isPending ? "sc-pending" : ""}`}>
        <div className="sc-top">
          <div className="sc-left">
            <div className={`sc-num ${isDone ? "sc-num--done" : isActive ? "sc-num--active" : "sc-num--pending"}`}>
              {isDone ? (
                <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                  <path d="M1 4.5L4.5 8L11 1" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : isActive ? (
                <span className="sc-pulse" />
              ) : (
                <span className="sc-step-num">{index + 1}</span>
              )}
            </div>
            <div>
              <span className="sc-mono">{step.mono}</span>
              <h3 className={`sc-title ${isPending ? "sc-title--dim" : ""}`}>{step.label}</h3>
            </div>
          </div>
          <div>
            {isActive  && <span className="sc-badge sc-badge--active"><span className="sc-bdot" />Processing</span>}
            {isDone    && <span className="sc-badge sc-badge--done">Complete</span>}
            {isPending && <span className="sc-badge sc-badge--pending">Waiting</span>}
          </div>
        </div>

        {(isDone || isActive) && stepData && (
          <div className="sc-body">
            <div className="sc-divider" />
            <div className="sc-stats">
              {step.renderData(stepData).map((item) => (
                <div key={item.label} className="sc-stat">
                  <span className="sc-stat-label">{item.label}</span>
                  <span className="sc-stat-value">{item.value ?? "—"}</span>
                </div>
              ))}
            </div>
            {isDone && step.hasImage && step.imageEndpoint && (
              <StepImage endpoint={step.imageEndpoint} processId={processId} label={step.label} />
            )}
          </div>
        )}
      </div>

      {!isLast && (
        <div className="sc-connector">
          <div className={`sc-conn-line ${isDone ? "sc-conn-line--done" : isActive ? "sc-conn-line--active" : ""}`}>
            <div className="sc-conn-dot" />
            <div className="sc-conn-shaft" />
            <div className="sc-conn-arrow">
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 1L5 7L9 1" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PipelineProgress({ processId, onReset }) {
  const [processStatus, setProcessStatus] = useState("pending");
  const [progress, setProgress]           = useState(0);
  const [error, setError]                 = useState(null);
  const [stepData, setStepData]           = useState({});
  const [outputUrl, setOutputUrl]         = useState(null);
  const pollerRef = useRef(null);

  const fetchStepData = useCallback(async (step) => {
    try {
      const res = await API.get(step.endpoint(processId));
      setStepData((prev) => ({ ...prev, [step.key]: res.data }));
    } catch (_) {}
  }, [processId]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await API.get(`watermarking/process/${processId}/status`);
        if (!active) return;
        const { status: s, progress: p, error: e } = res.data;
        setProcessStatus(s);
        setProgress(p ?? 0);
        if (e) setError(e);
        const curIdx = statusIndex(s);
        STEPS.forEach((step) => {
          if (STATUS_ORDER.indexOf(step.status) < curIdx) {
            setStepData((prev) => {
              if (prev[step.key]) return prev;
              fetchStepData(step);
              return prev;
            });
          }
        });
        if (s === "completed") {
          STEPS.forEach((step) => fetchStepData(step));
          API.get(`watermarking/process/${processId}/image/output/`, { responseType: "blob" })
            .then((r) => { if (active) setOutputUrl(URL.createObjectURL(r.data)); })
            .catch(() => {});
        }
        if (s !== "completed" && s !== "failed") {
          pollerRef.current = setTimeout(poll, 1500);
        }
      } catch (_) {
        if (active) pollerRef.current = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { active = false; clearTimeout(pollerRef.current); };
  }, [processId, fetchStepData]);

  const downloadImage = () => {
    if (!outputUrl) return;
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `watermarked_${processId}.png`;
    a.click();
  };

  const downloadKey = async () => {
    try {
      const res = await API.get(`watermarking/process/${processId}/key/`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data);
      a.download = `key_process_${processId}.npz`;
      a.click();
    } catch (_) { alert("Key not available yet."); }
  };

  const isCompleted = processStatus === "completed";
  const isFailed    = processStatus === "failed";
  const activeLabel = STEPS.find((s) => s.status === processStatus)?.label;
  const doneCount   = STEPS.filter((s) => statusIndex(processStatus) > STATUS_ORDER.indexOf(s.status)).length;

  return (
    <div className="page">
      <Topbar />

      <div className="pp-layout">

        {/* ══ LEFT — Sticky progress card ══ */}
        <aside className="pp-sidebar">
          <div className="pp-sidebar-inner auth-card reveal">

            {/* Header */}
            <p className="eyebrow">Process #{processId}</p>
            <h2 style={{ fontSize: "1.35rem", margin: "2px 0 0" }}>
              {isFailed ? "Failed" : isCompleted ? "Complete ✓" : "Processing…"}
            </h2>

            {/* Active step name */}
            {!isCompleted && !isFailed && activeLabel && (
              <p className="subtitle" style={{ fontSize: "0.82rem", marginTop: 6 }}>
                <span className="pp-blink-dot" />{activeLabel}
              </p>
            )}

            {/* Progress ring + percent */}
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
                  style={{ font: "700 1.25rem 'Space Grotesk', sans-serif", fill: "var(--ink-900)" }}>
                  {progress}%
                </text>
                <text x="48" y="60" textAnchor="middle"
                  style={{ font: "500 0.65rem 'DM Mono', monospace", fill: "var(--ink-500)", letterSpacing: "0.06em" }}>
                  DONE
                </text>
              </svg>
            </div>

            {/* Step count */}
            <div className="pp-step-count">
              <span className="pp-step-count-num">{doneCount}</span>
              <span className="pp-step-count-of"> / {STEPS.length} steps</span>
            </div>

            {/* Bar */}
            <div className="pp-bar" style={{ marginTop: 12 }}>
              <div className="pp-bar-fill" style={{
                width: `${progress}%`,
                background: isFailed
                  ? "linear-gradient(90deg,var(--danger),#f87171)"
                  : "linear-gradient(90deg,var(--primary),#34d399)",
              }} />
            </div>
            <div className="pp-bar-meta">
              <span className="pp-bar-lbl">
                {isFailed ? "failed" : isCompleted ? "all complete" : processStatus}
              </span>
              <span className="pp-bar-pct">{progress}%</span>
            </div>

            {/* Mini step list */}
            <div className="pp-mini-steps">
              {STEPS.map((step) => {
                const curIdx  = statusIndex(processStatus);
                const stepIdx = STATUS_ORDER.indexOf(step.status);
                const done   = curIdx > stepIdx;
                const active = processStatus === step.status;
                return (
                  <div key={step.key} className={`pp-mini-step ${done ? "pp-mini-step--done" : active ? "pp-mini-step--active" : ""}`}>
                    <div className={`pp-mini-dot ${done ? "pp-mini-dot--done" : active ? "pp-mini-dot--active" : ""}`} />
                    <span className="pp-mini-label">{step.label}</span>
                    {active && <span className="pp-mini-badge"><span className="sc-bdot" /></span>}
                    {done   && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <path d="M1 3.5L3.5 6L8 1" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Error */}
            {isFailed && error && (
              <div className="status error" style={{ marginTop: 14, fontSize: "0.8rem" }}>
                {error}
              </div>
            )}

            {/* ── Download buttons (only when complete) ── */}
            {isCompleted && (
              <div className="pp-dl-section">
                <div className="pp-dl-divider" />
                <p className="eyebrow" style={{ marginBottom: 10 }}>Export</p>

                {outputUrl && (
                  <div className="pp-dl-thumb">
                    <img src={outputUrl} alt="Output preview" />
                    <span className="pp-dl-thumb-lbl">Watermarked Output</span>
                  </div>
                )}

                <div className="pp-dl-btns">
                  <button className="primary-btn pp-dl-btn" onClick={downloadImage}>
                    ↓ Image
                  </button>
                  <button className="ghost-btn pp-dl-btn" onClick={downloadKey}>
                    ↓ Key
                  </button>
                </div>

                <button className="text-link" onClick={onReset}
                  style={{ marginTop: 12, display: "block", width: "100%", textAlign: "center", fontSize: "0.82rem" }}>
                  ← Start new upload
                </button>
              </div>
            )}

            {/* Back button (only while running) */}
            {!isCompleted && (
              <button className="ghost-btn"
                onClick={onReset}
                style={{ marginTop: 16, width: "100%", fontSize: "0.82rem" }}>
                ← New Upload
              </button>
            )}
          </div>
        </aside>

        {/* ══ RIGHT — Scrollable step cards ══ */}
        <main className="pp-main">
          {STEPS.map((step, i) => (
            <StepCard
              key={step.key}
              step={step}
              index={i}
              processId={processId}
              currentStatus={processStatus}
              stepData={stepData[step.key] || null}
              isLast={i === STEPS.length - 1}
            />
          ))}
        </main>

      </div>

      <style>{`
        /* ── Page shell ── */
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

        /* ── Sidebar ── */
        .pp-sidebar {
          position: sticky;
          top: 24px;
          align-self: start;
        }

        .pp-sidebar-inner {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: clamp(18px, 2.5vw, 28px);
        }

        /* Suppress default auth-card hover on sidebar */
        .pp-sidebar-inner:hover {
          transform: none;
          box-shadow: var(--shadow);
        }

        /* Ring */
        .pp-ring-wrap {
          display: flex;
          justify-content: center;
          margin: 16px 0 4px;
        }

        /* Step count */
        .pp-step-count {
          text-align: center;
          margin-bottom: 4px;
        }

        .pp-step-count-num {
          font: 700 1.4rem/1 "Space Grotesk", sans-serif;
          color: var(--ink-900);
        }

        .pp-step-count-of {
          font: 500 0.82rem/1 "DM Mono", monospace;
          color: var(--ink-500);
        }

        /* Progress bar */
        .pp-bar {
          height: 5px;
          background: rgba(16,32,38,0.1);
          border-radius: 99px;
          overflow: hidden;
        }

        .pp-bar-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 0.7s cubic-bezier(0.4,0,0.2,1);
          box-shadow: 0 0 8px rgba(15,118,110,0.2);
        }

        .pp-bar-meta {
          display: flex;
          justify-content: space-between;
          margin-top: 5px;
        }

        .pp-bar-lbl {
          font: 500 0.68rem/1 "DM Mono", monospace;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-500);
        }

        .pp-bar-pct {
          font: 600 0.75rem/1 "DM Mono", monospace;
          color: var(--primary);
        }

        /* Mini step list */
        .pp-mini-steps {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-top: 14px;
          border-top: 1px solid var(--line);
          padding-top: 12px;
        }

        .pp-mini-step {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 6px;
          border-radius: 7px;
          transition: background 0.2s;
        }

        .pp-mini-step--done   { background: rgba(15,118,110,0.05); }
        .pp-mini-step--active { background: rgba(15,118,110,0.09); }

        .pp-mini-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          background: rgba(16,32,38,0.18);
          transition: all 0.3s;
        }

        .pp-mini-dot--done   { background: var(--primary); opacity: 0.7; }
        .pp-mini-dot--active { background: var(--primary); animation: pp-pulse 1.2s ease-in-out infinite; }

        .pp-mini-label {
          font: 500 0.76rem/1.2 "Space Grotesk", sans-serif;
          color: var(--ink-700);
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pp-mini-step--done   .pp-mini-label { color: var(--primary-strong); }
        .pp-mini-step--active .pp-mini-label { color: var(--ink-900); font-weight: 600; }

        .pp-mini-badge {
          display: flex;
          align-items: center;
        }

        /* Download section */
        .pp-dl-section {
          margin-top: 4px;
        }

        .pp-dl-divider {
          height: 1px;
          background: var(--line);
          margin: 16px 0 14px;
        }

        .pp-dl-thumb {
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--line);
          margin-bottom: 12px;
          box-shadow: 0 3px 12px rgba(11,38,46,0.08);
        }

        .pp-dl-thumb img {
          width: 100%;
          display: block;
          max-height: 130px;
          object-fit: cover;
        }

        .pp-dl-thumb-lbl {
          display: block;
          padding: 5px 10px;
          background: rgba(247,244,238,0.95);
          font: 500 0.65rem/1 "DM Mono", monospace;
          color: var(--ink-500);
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .pp-dl-btns {
          display: flex;
          gap: 8px;
        }

        .pp-dl-btn {
          flex: 1;
          margin-top: 0 !important;
          min-width: 0;
          font-size: 0.84rem !important;
          padding: 10px 8px !important;
        }

        /* Blink dot */
        .pp-blink-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--primary);
          margin-right: 6px;
          vertical-align: middle;
          animation: pp-blink 1.1s ease-in-out infinite;
        }

        /* ── Right column ── */
        .pp-main {
          display: flex;
          flex-direction: column;
          padding-top: 4px;
        }

        /* ── Step cards ── */
        .sc-wrapper {
          display: flex;
          flex-direction: column;
        }

        .sc-card {
          border-radius: var(--radius-lg);
          border: 1px solid var(--line);
          background: var(--card);
          backdrop-filter: blur(8px);
          padding: 16px 18px;
          transition: box-shadow 0.25s ease, border-color 0.25s ease, transform 0.2s ease;
        }

        .sc-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(11,38,46,0.09);
        }

        .sc-done    { border-color: rgba(15,118,110,0.22); background: rgba(255,255,255,0.92); }
        .sc-active  {
          border-color: rgba(15,118,110,0.45);
          background: rgba(255,255,255,0.98);
          box-shadow: 0 0 0 3px rgba(15,118,110,0.08), 0 6px 20px rgba(11,38,46,0.1);
        }
        .sc-pending { background: rgba(255,255,255,0.5); opacity: 0.6; }

        .sc-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .sc-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .sc-num {
          width: 30px; height: 30px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
        }

        .sc-num--done    { background: rgba(15,118,110,0.12); border: 1.5px solid var(--primary); color: var(--primary); }
        .sc-num--active  { background: rgba(15,118,110,0.07); border: 1.5px solid var(--primary); box-shadow: 0 0 0 4px rgba(15,118,110,0.1); }
        .sc-num--pending { background: rgba(16,32,38,0.04); border: 1.5px solid var(--line); }

        .sc-pulse {
          display: block;
          width: 9px; height: 9px;
          border-radius: 50%;
          background: var(--primary);
          animation: pp-pulse 1.2s ease-in-out infinite;
        }

        .sc-step-num {
          font: 600 0.78rem/1 "DM Mono", monospace;
          color: var(--ink-500);
        }

        .sc-mono {
          display: block;
          font: 500 0.67rem/1 "DM Mono", monospace;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-500);
          margin-bottom: 2px;
        }

        .sc-title {
          margin: 0;
          font: 600 0.96rem/1.2 "Space Grotesk", sans-serif;
          color: var(--ink-900);
          transition: color 0.3s;
        }

        .sc-title--dim { color: var(--ink-500) !important; }

        .sc-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 99px;
          font: 500 0.67rem/1 "DM Mono", monospace;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }

        .sc-badge--active  { background: rgba(15,118,110,0.1); border: 1px solid rgba(15,118,110,0.3); color: var(--primary-strong); }
        .sc-badge--done    { background: rgba(15,118,110,0.07); border: 1px solid rgba(15,118,110,0.18); color: var(--primary); }
        .sc-badge--pending { background: rgba(16,32,38,0.04); border: 1px solid var(--line); color: var(--ink-500); }

        .sc-bdot {
          display: block;
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--primary);
          animation: pp-blink 1s ease-in-out infinite;
        }

        .sc-body { margin-top: 12px; }

        .sc-divider {
          height: 1px;
          background: var(--line);
          margin-bottom: 12px;
        }

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
          font: 500 0.64rem/1 "DM Mono", monospace;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-500);
        }

        .sc-stat-value {
          font: 600 0.86rem/1.3 "DM Mono", monospace;
          color: var(--primary-strong);
        }

        /* Images */
        .simg-wrap {
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--line);
          max-width: 220px;
          box-shadow: 0 3px 10px rgba(11,38,46,0.07);
        }

        .simg { width: 100%; display: block; max-height: 140px; object-fit: cover; }

        .simg-label {
          display: block;
          padding: 5px 10px;
          background: rgba(247,244,238,0.95);
          font: 500 0.66rem/1 "DM Mono", monospace;
          color: var(--ink-500);
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .simg-placeholder {
          max-width: 220px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(16,32,38,0.03);
          border: 1px dashed var(--line);
          border-radius: 8px;
          font: 500 0.75rem/1 "DM Mono", monospace;
          color: var(--ink-500);
        }

        /* Connectors */
        .sc-connector {
          display: flex;
          justify-content: center;
          height: 32px;
          align-items: stretch;
        }

        .sc-conn-line {
          display: flex;
          flex-direction: column;
          align-items: center;
          color: var(--line);
          transition: color 0.4s;
        }

        .sc-conn-line--done   { color: var(--primary); opacity: 0.45; }
        .sc-conn-line--active { color: var(--primary); opacity: 0.65; }

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

        /* ── Mobile: stack layout ── */
        @media (max-width: 760px) {
          .pp-layout {
            grid-template-columns: 1fr;
            padding: 16px 14px 60px;
            gap: 16px;
          }

          .pp-sidebar { position: static; }
          .pp-ring-wrap { margin: 10px 0 2px; }
        }
      `}</style>
    </div>
  );
}


// import { useState, useEffect, useRef, useCallback } from "react";
// import API from "../api/api";
// import Topbar from "./TopBar";

// const STEPS = [
//   {
//     key: "resizing",
//     status: "resizing",
//     label: "Resize Image",
//     mono: "DTCWT · Padding",
//     endpoint: (id) => `watermarking/process/${id}/resizing/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/resized/`,
//     hasImage: true,
//     renderData: (d) => [{ label: "DTCWT Levels", value: d.dtcwt_levels }],
//   },
//   {
//     key: "forwarding",
//     status: "forwarding",
//     label: "Forward Pipeline",
//     mono: "DTCWT → DCT → SVD",
//     endpoint: (id) => `watermarking/process/${id}/forward/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "Blocks", value: d.n_blocks },
//       { label: "SV Length", value: d.sv_length },
//       { label: "LL Shape", value: d.LL_shape ? `${d.LL_shape[0]} × ${d.LL_shape[1]}` : "—" },
//     ],
//   },
//   {
//     key: "encryption",
//     status: "encrypting",
//     label: "Henon Encryption",
//     mono: "Chaotic Scrambling",
//     endpoint: (id) => `watermarking/process/${id}/encryption/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/wm_encrypted/`,
//     hasImage: true,
//     renderData: (d) => [
//       { label: "Henon a", value: d.henon_a?.toFixed(4) },
//       { label: "Henon b", value: d.henon_b?.toFixed(4) },
//       { label: "WM Shape", value: d.watermark_shape ? d.watermark_shape.join(" × ") : "—" },
//     ],
//   },
//   {
//     key: "svd",
//     status: "svd",
//     label: "SVD Decomposition",
//     mono: "Singular Value Decomp.",
//     endpoint: (id) => `watermarking/process/${id}/svd/`,
//     hasImage: false,
//     renderData: () => [{ label: "Operation", value: "Applied on watermark" }],
//   },
//   {
//     key: "pso",
//     status: "pso",
//     label: "PSO Optimisation",
//     mono: "Particle Swarm",
//     endpoint: (id) => `watermarking/process/${id}/pso/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "α*", value: d.alpha_star?.toFixed(6) },
//       { label: "PSO Cost", value: d.pso_cost?.toFixed(6) },
//       { label: "Particles", value: d.pso_particles },
//       { label: "Iterations", value: d.pso_iterations },
//     ],
//   },
//   {
//     key: "embedding",
//     status: "embedding",
//     label: "Embed Watermark",
//     mono: "IDCT → IDTCWT",
//     endpoint: (id) => `watermarking/process/${id}/embedding/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/output/`,
//     hasImage: true,
//     renderData: (d) => [
//       { label: "PSNR", value: d.psnr_value ? `${d.psnr_value.toFixed(2)} dB` : "—" },
//     ],
//   },
//   {
//     key: "threshold",
//     status: "thresholding",
//     label: "Compute Threshold",
//     mono: "Tamper Detection",
//     endpoint: (id) => `watermarking/process/${id}/threshold/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "Max Drift", value: d.max_benign_drift?.toFixed(6) },
//       { label: "Auto Thresh.", value: d.auto_threshold?.toFixed(6) },
//       { label: "Final Thresh.", value: d.final_threshold?.toFixed(6) },
//     ],
//   },
// ];

// const STATUS_ORDER = [
//   "pending", "resizing", "forwarding", "encrypting",
//   "svd", "pso", "embedding", "thresholding", "completed",
// ];

// function statusIndex(s) {
//   const i = STATUS_ORDER.indexOf(s);
//   return i === -1 ? 0 : i;
// }

// function StepImage({ endpoint, processId, label }) {
//   const [src, setSrc] = useState(null);
//   const [err, setErr] = useState(false);
//   useEffect(() => {
//     let cancelled = false;
//     API.get(endpoint(processId), { responseType: "blob" })
//       .then((r) => { if (!cancelled) setSrc(URL.createObjectURL(r.data)); })
//       .catch(() => { if (!cancelled) setErr(true); });
//     return () => { cancelled = true; };
//   }, [endpoint, processId]);
//   if (err) return null;
//   if (!src) return (
//     <div className="simg-placeholder">Loading image…</div>
//   );
//   return (
//     <div className="simg-wrap">
//       <img src={src} alt={label} className="simg" />
//       <span className="simg-label">{label}</span>
//     </div>
//   );
// }

// function StepCard({ step, index, processId, currentStatus, stepData, isLast }) {
//   const curIdx = statusIndex(currentStatus);
//   const stepIdx = STATUS_ORDER.indexOf(step.status);
//   const isDone    = curIdx > stepIdx;
//   const isActive  = currentStatus === step.status;
//   const isPending = !isDone && !isActive;

//   return (
//     <div className="sc-wrapper">
//       {/* ── The card box ── */}
//       <div className={`sc-card ${isDone ? "sc-done" : ""} ${isActive ? "sc-active" : ""} ${isPending ? "sc-pending" : ""}`}>

//         {/* Card top row */}
//         <div className="sc-top">
//           <div className="sc-left">
//             {/* Step number circle */}
//             <div className={`sc-num ${isDone ? "sc-num--done" : isActive ? "sc-num--active" : "sc-num--pending"}`}>
//               {isDone ? (
//                 <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
//                   <path d="M1 4.5L4.5 8L11 1" stroke="currentColor" strokeWidth="2"
//                     strokeLinecap="round" strokeLinejoin="round" />
//                 </svg>
//               ) : isActive ? (
//                 <span className="sc-pulse" />
//               ) : (
//                 <span className="sc-step-num">{index + 1}</span>
//               )}
//             </div>
//             {/* Labels */}
//             <div>
//               <span className="sc-mono">{step.mono}</span>
//               <h3 className={`sc-title ${isPending ? "sc-title--dim" : ""}`}>{step.label}</h3>
//             </div>
//           </div>

//           {/* Status badge */}
//           <div>
//             {isActive  && <span className="sc-badge sc-badge--active"><span className="sc-bdot" />Processing</span>}
//             {isDone    && <span className="sc-badge sc-badge--done">Complete</span>}
//             {isPending && <span className="sc-badge sc-badge--pending">Waiting</span>}
//           </div>
//         </div>

//         {/* Expanded body when active or done */}
//         {(isDone || isActive) && stepData && (
//           <div className="sc-body">
//             <div className="sc-divider" />
//             <div className="sc-stats">
//               {step.renderData(stepData).map((item) => (
//                 <div key={item.label} className="sc-stat">
//                   <span className="sc-stat-label">{item.label}</span>
//                   <span className="sc-stat-value">{item.value ?? "—"}</span>
//                 </div>
//               ))}
//             </div>
//             {isDone && step.hasImage && step.imageEndpoint && (
//               <StepImage endpoint={step.imageEndpoint} processId={processId} label={step.label} />
//             )}
//           </div>
//         )}
//       </div>

//       {/* ── Connector below the card ── */}
//       {!isLast && (
//         <div className="sc-connector">
//           <div className={`sc-connector-line ${isDone ? "sc-connector-line--done" : isActive ? "sc-connector-line--active" : ""}`}>
//             <div className="sc-connector-dot sc-connector-dot--top" />
//             <div className="sc-connector-shaft" />
//             <div className="sc-connector-arrow">
//               <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
//                 <path d="M1 1L5 7L9 1" stroke="currentColor" strokeWidth="1.5"
//                   strokeLinecap="round" strokeLinejoin="round" />
//               </svg>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// export default function PipelineProgress({ processId, onReset }) {
//   const [processStatus, setProcessStatus] = useState("pending");
//   const [progress, setProgress]           = useState(0);
//   const [error, setError]                 = useState(null);
//   const [stepData, setStepData]           = useState({});
//   const [outputUrl, setOutputUrl]         = useState(null);
//   const pollerRef = useRef(null);

//   const fetchStepData = useCallback(async (step) => {
//     try {
//       const res = await API.get(step.endpoint(processId));
//       setStepData((prev) => ({ ...prev, [step.key]: res.data }));
//     } catch (_) {}
//   }, [processId]);

//   useEffect(() => {
//     let active = true;
//     const poll = async () => {
//       try {
//         const res = await API.get(`watermarking/process/${processId}/status`);
//         if (!active) return;
//         const { status: s, progress: p, error: e } = res.data;
//         setProcessStatus(s);
//         setProgress(p ?? 0);
//         if (e) setError(e);
//         const curIdx = statusIndex(s);
//         STEPS.forEach((step) => {
//           if (STATUS_ORDER.indexOf(step.status) < curIdx) {
//             setStepData((prev) => {
//               if (prev[step.key]) return prev;
//               fetchStepData(step);
//               return prev;
//             });
//           }
//         });
//         if (s === "completed") {
//           STEPS.forEach((step) => fetchStepData(step));
//           API.get(`watermarking/process/${processId}/image/output/`, { responseType: "blob" })
//             .then((r) => { if (active) setOutputUrl(URL.createObjectURL(r.data)); })
//             .catch(() => {});
//         }
//         if (s !== "completed" && s !== "failed") {
//           pollerRef.current = setTimeout(poll, 1500);
//         }
//       } catch (_) {
//         if (active) pollerRef.current = setTimeout(poll, 3000);
//       }
//     };
//     poll();
//     return () => { active = false; clearTimeout(pollerRef.current); };
//   }, [processId, fetchStepData]);

//   const downloadImage = () => {
//     if (!outputUrl) return;
//     const a = document.createElement("a"); a.href = outputUrl;
//     a.download = `watermarked_${processId}.png`; a.click();
//   };

//   const downloadKey = async () => {
//     try {
//       const res = await API.get(`watermarking/process/${processId}/key/`, { responseType: "blob" });
//       const a = document.createElement("a"); a.href = URL.createObjectURL(res.data);
//       a.download = `key_process_${processId}.npz`; a.click();
//     } catch (_) { alert("Key not available yet."); }
//   };

//   const isCompleted = processStatus === "completed";
//   const isFailed    = processStatus === "failed";
//   const activeLabel = STEPS.find((s) => s.status === processStatus)?.label;

//   return (
//     <div className="page">
//       <Topbar />
//       <div className="content pp-page">

//         {/* ── Progress header ── */}
//         <div className="auth-card reveal pp-hdr">
//           <div className="pp-hdr-row">
//             <div>
//               <p className="eyebrow">Process #{processId}</p>
//               <h2 style={{ fontSize: "clamp(1.25rem,3vw,1.75rem)", marginBottom: 0 }}>
//                 {isFailed ? "Pipeline Failed" : isCompleted ? "Pipeline Complete" : "Processing…"}
//               </h2>
//               {!isCompleted && !isFailed && activeLabel && (
//                 <p className="subtitle" style={{ marginTop: 4, fontSize: "0.88rem" }}>
//                   <span className="pp-blink-dot" />{activeLabel}
//                 </p>
//               )}
//             </div>
//             <button className="ghost-btn" onClick={onReset}>← New Upload</button>
//           </div>

//           {/* Progress bar */}
//           <div className="pp-bar">
//             <div className="pp-bar-fill" style={{
//               width: `${progress}%`,
//               background: isFailed
//                 ? "linear-gradient(90deg,var(--danger),#f87171)"
//                 : "linear-gradient(90deg,var(--primary),#34d399)",
//             }} />
//           </div>
//           <div className="pp-bar-meta">
//             <span className="pp-bar-lbl">
//               {isFailed ? "failed" : isCompleted ? "all steps complete" : processStatus}
//             </span>
//             <span className="pp-bar-pct">{progress}%</span>
//           </div>

//           {isFailed && error && (
//             <div className="status error" style={{ marginTop: 12 }}>
//               <strong>Error:</strong> {error}
//             </div>
//           )}
//         </div>

//         {/* ── Step cards ── */}
//         <div className="pp-steps">
//           {STEPS.map((step, i) => (
//             <StepCard
//               key={step.key}
//               step={step}
//               index={i}
//               processId={processId}
//               currentStatus={processStatus}
//               stepData={stepData[step.key] || null}
//               isLast={i === STEPS.length - 1}
//             />
//           ))}
//         </div>

//         {/* ── Download card ── */}
//         {isCompleted && (
//           <div className="auth-card reveal pp-dl">
//             <p className="eyebrow">Ready to export</p>
//             <h2 style={{ fontSize: "1.4rem" }}>Your files are ready</h2>
//             <p className="subtitle" style={{ marginTop: 6, fontSize: "0.88rem" }}>
//               Download the watermarked image and encryption key for tamper detection.
//             </p>
//             {outputUrl && (
//               <div className="pp-dl-img">
//                 <img src={outputUrl} alt="Watermarked output" />
//                 <span className="pp-dl-img-lbl">Watermarked Output</span>
//               </div>
//             )}
//             <div className="pp-dl-btns">
//               <button className="primary-btn pp-dl-btn" onClick={downloadImage}>
//                 ↓ Download Image
//               </button>
//               <button className="ghost-btn pp-dl-btn" onClick={downloadKey}>
//                 ↓ Download Key
//               </button>
//             </div>
//           </div>
//         )}
//       </div>

//       <style>{`
//         /* ── Page layout ── */
//         .pp-page {
//           flex-direction: column;
//           align-items: center;
//           gap: 0;
//           padding: 28px 20px 64px;
//         }

//         /* ── Header card ── */
//         .pp-hdr {
//           width: min(600px, 100%);
//           margin-bottom: 24px;
//         }

//         .pp-hdr-row {
//           display: flex;
//           justify-content: space-between;
//           align-items: flex-start;
//           gap: 16px;
//           margin-bottom: 18px;
//         }

//         .pp-blink-dot {
//           display: inline-block;
//           width: 7px; height: 7px;
//           border-radius: 50%;
//           background: var(--primary);
//           margin-right: 7px;
//           vertical-align: middle;
//           animation: pp-blink 1.1s ease-in-out infinite;
//         }

//         .pp-bar {
//           height: 6px;
//           background: rgba(16,32,38,0.1);
//           border-radius: 99px;
//           overflow: hidden;
//         }

//         .pp-bar-fill {
//           height: 100%;
//           border-radius: 99px;
//           transition: width 0.7s cubic-bezier(0.4,0,0.2,1);
//           box-shadow: 0 0 8px rgba(15,118,110,0.2);
//         }

//         .pp-bar-meta {
//           display: flex;
//           justify-content: space-between;
//           margin-top: 6px;
//         }

//         .pp-bar-lbl {
//           font: 500 0.72rem/1 "DM Mono", monospace;
//           letter-spacing: 0.1em;
//           text-transform: uppercase;
//           color: var(--ink-500);
//         }

//         .pp-bar-pct {
//           font: 600 0.82rem/1 "DM Mono", monospace;
//           color: var(--primary);
//         }

//         /* ── Steps column ── */
//         .pp-steps {
//           width: min(600px, 100%);
//           display: flex;
//           flex-direction: column;
//           align-items: stretch;
//         }

//         /* ── Step wrapper (card + connector) ── */
//         .sc-wrapper {
//           display: flex;
//           flex-direction: column;
//           align-items: stretch;
//         }

//         /* ── Step card ── */
//         .sc-card {
//           border-radius: var(--radius-lg);
//           border: 1px solid var(--line);
//           background: var(--card);
//           backdrop-filter: blur(8px);
//           padding: 16px 18px;
//           transition: box-shadow 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
//         }

//         .sc-card:hover {
//           transform: translateY(-1px);
//           box-shadow: 0 10px 28px rgba(11,38,46,0.1);
//         }

//         .sc-done {
//           border-color: rgba(15,118,110,0.22);
//           background: rgba(255,255,255,0.92);
//         }

//         .sc-active {
//           border-color: rgba(15,118,110,0.45);
//           background: rgba(255,255,255,0.98);
//           box-shadow: 0 0 0 3px rgba(15,118,110,0.08), 0 8px 24px rgba(11,38,46,0.1);
//         }

//         .sc-pending {
//           background: rgba(255,255,255,0.5);
//           opacity: 0.65;
//         }

//         /* Card top row */
//         .sc-top {
//           display: flex;
//           justify-content: space-between;
//           align-items: center;
//           gap: 12px;
//         }

//         .sc-left {
//           display: flex;
//           align-items: center;
//           gap: 12px;
//         }

//         /* Step number circle */
//         .sc-num {
//           width: 32px; height: 32px;
//           border-radius: 50%;
//           flex-shrink: 0;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           transition: all 0.3s ease;
//         }

//         .sc-num--done {
//           background: rgba(15,118,110,0.12);
//           border: 1.5px solid var(--primary);
//           color: var(--primary);
//         }

//         .sc-num--active {
//           background: rgba(15,118,110,0.07);
//           border: 1.5px solid var(--primary);
//           box-shadow: 0 0 0 4px rgba(15,118,110,0.1);
//         }

//         .sc-num--pending {
//           background: rgba(16,32,38,0.04);
//           border: 1.5px solid var(--line);
//         }

//         .sc-pulse {
//           display: block;
//           width: 9px; height: 9px;
//           border-radius: 50%;
//           background: var(--primary);
//           animation: pp-pulse 1.2s ease-in-out infinite;
//         }

//         .sc-step-num {
//           font: 600 0.8rem/1 "DM Mono", monospace;
//           color: var(--ink-500);
//         }

//         .sc-mono {
//           display: block;
//           font: 500 0.68rem/1 "DM Mono", monospace;
//           letter-spacing: 0.1em;
//           text-transform: uppercase;
//           color: var(--ink-500);
//           margin-bottom: 2px;
//         }

//         .sc-title {
//           margin: 0;
//           font: 600 0.97rem/1.2 "Space Grotesk", sans-serif;
//           color: var(--ink-900);
//           transition: color 0.3s;
//         }

//         .sc-title--dim { color: var(--ink-500) !important; }

//         /* Badges */
//         .sc-badge {
//           display: inline-flex;
//           align-items: center;
//           gap: 5px;
//           padding: 3px 9px;
//           border-radius: 99px;
//           font: 500 0.68rem/1 "DM Mono", monospace;
//           letter-spacing: 0.05em;
//           white-space: nowrap;
//         }

//         .sc-badge--active {
//           background: rgba(15,118,110,0.1);
//           border: 1px solid rgba(15,118,110,0.3);
//           color: var(--primary-strong);
//         }

//         .sc-badge--done {
//           background: rgba(15,118,110,0.07);
//           border: 1px solid rgba(15,118,110,0.18);
//           color: var(--primary);
//         }

//         .sc-badge--pending {
//           background: rgba(16,32,38,0.04);
//           border: 1px solid var(--line);
//           color: var(--ink-500);
//         }

//         .sc-bdot {
//           display: block;
//           width: 5px; height: 5px;
//           border-radius: 50%;
//           background: var(--primary);
//           animation: pp-blink 1s ease-in-out infinite;
//         }

//         /* Card body */
//         .sc-body { margin-top: 14px; }

//         .sc-divider {
//           height: 1px;
//           background: var(--line);
//           margin-bottom: 12px;
//         }

//         .sc-stats {
//           display: flex;
//           flex-wrap: wrap;
//           gap: 6px;
//           margin-bottom: 10px;
//         }

//         .sc-stat {
//           display: flex;
//           flex-direction: column;
//           gap: 2px;
//           background: rgba(15,118,110,0.05);
//           border: 1px solid rgba(15,118,110,0.12);
//           border-radius: 8px;
//           padding: 6px 10px;
//           min-width: 80px;
//         }

//         .sc-stat-label {
//           font: 500 0.65rem/1 "DM Mono", monospace;
//           text-transform: uppercase;
//           letter-spacing: 0.1em;
//           color: var(--ink-500);
//         }

//         .sc-stat-value {
//           font: 600 0.87rem/1.3 "DM Mono", monospace;
//           color: var(--primary-strong);
//         }

//         /* Step images */
//         .simg-wrap {
//           border-radius: 10px;
//           overflow: hidden;
//           border: 1px solid var(--line);
//           max-width: 220px;
//           box-shadow: 0 3px 12px rgba(11,38,46,0.07);
//         }

//         .simg {
//           width: 100%;
//           display: block;
//           max-height: 140px;
//           object-fit: cover;
//         }

//         .simg-label {
//           display: block;
//           padding: 5px 10px;
//           background: rgba(247,244,238,0.95);
//           font: 500 0.67rem/1 "DM Mono", monospace;
//           color: var(--ink-500);
//           letter-spacing: 0.07em;
//           text-transform: uppercase;
//         }

//         .simg-placeholder {
//           max-width: 220px;
//           height: 52px;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           background: rgba(16,32,38,0.03);
//           border: 1px dashed var(--line);
//           border-radius: 8px;
//           font: 500 0.76rem/1 "DM Mono", monospace;
//           color: var(--ink-500);
//         }

//         /* ── Connector between cards ── */
//         .sc-connector {
//           display: flex;
//           justify-content: center;
//           height: 36px;
//           align-items: stretch;
//         }

//         .sc-connector-line {
//           display: flex;
//           flex-direction: column;
//           align-items: center;
//           gap: 0;
//           color: var(--line);
//           transition: color 0.4s ease;
//         }

//         .sc-connector-line--done   { color: var(--primary); opacity: 0.5; }
//         .sc-connector-line--active { color: var(--primary); opacity: 0.7; }

//         .sc-connector-dot--top {
//           width: 6px; height: 6px;
//           border-radius: 50%;
//           background: currentColor;
//           flex-shrink: 0;
//         }

//         .sc-connector-shaft {
//           width: 1.5px;
//           flex: 1;
//           background: currentColor;
//         }

//         .sc-connector-arrow {
//           flex-shrink: 0;
//           color: currentColor;
//           margin-top: -2px;
//         }

//         /* ── Download card ── */
//         .pp-dl {
//           width: min(600px, 100%);
//           margin-top: 24px;
//         }

//         .pp-dl-img {
//           margin-top: 16px;
//           border-radius: 12px;
//           overflow: hidden;
//           border: 1px solid var(--line);
//           box-shadow: 0 6px 20px rgba(11,38,46,0.1);
//         }

//         .pp-dl-img img {
//           width: 100%;
//           display: block;
//           max-height: 220px;
//           object-fit: cover;
//         }

//         .pp-dl-img-lbl {
//           display: block;
//           padding: 7px 12px;
//           background: rgba(247,244,238,0.95);
//           font: 500 0.72rem/1 "DM Mono", monospace;
//           color: var(--ink-500);
//           letter-spacing: 0.08em;
//           text-transform: uppercase;
//         }

//         .pp-dl-btns {
//           margin-top: 16px;
//           display: flex;
//           gap: 10px;
//           flex-wrap: wrap;
//         }

//         .pp-dl-btn {
//           flex: 1;
//           min-width: 140px;
//           margin-top: 0 !important;
//           text-align: center;
//         }

//         /* ── Keyframes ── */
//         @keyframes pp-pulse {
//           0%, 100% { transform: scale(1); opacity: 1; }
//           50% { transform: scale(1.55); opacity: 0.4; }
//         }

//         @keyframes pp-blink {
//           0%, 100% { opacity: 1; }
//           50% { opacity: 0.15; }
//         }

//         /* ── Mobile ── */
//         @media (max-width: 640px) {
//           .pp-hdr-row { flex-direction: column; }
//           .sc-top { flex-direction: column; align-items: flex-start; gap: 8px; }
//         }
//       `}</style>
//     </div>
//   );
// }

// import { useState, useEffect, useRef, useCallback } from "react";
// import API from "../api/api";
// import Topbar from "./TopBar";

// // ─── Step definitions ──────────────────────────────────────────────────────
// const STEPS = [
//   {
//     key: "resizing",
//     status: "resizing",
//     label: "Resize Image",
//     mono: "DTCWT · Padding",
//     endpoint: (id) => `watermarking/process/${id}/resizing/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/resized/`,
//     hasImage: true,
//     renderData: (d) => [
//       { label: "DTCWT Levels", value: d.dtcwt_levels },
//     ],
//   },
//   {
//     key: "forwarding",
//     status: "forwarding",
//     label: "Forward Pipeline",
//     mono: "DTCWT → DCT → SVD",
//     endpoint: (id) => `watermarking/process/${id}/forward/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "Blocks", value: d.n_blocks },
//       { label: "SV Length", value: d.sv_length },
//       { label: "LL Shape", value: d.LL_shape ? `${d.LL_shape[0]} × ${d.LL_shape[1]}` : "—" },
//     ],
//   },
//   {
//     key: "encryption",
//     status: "encrypting",
//     label: "Henon Encryption",
//     mono: "Chaotic Scrambling",
//     endpoint: (id) => `watermarking/process/${id}/encryption/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/wm_encrypted/`,
//     hasImage: true,
//     renderData: (d) => [
//       { label: "Henon a", value: d.henon_a?.toFixed(4) },
//       { label: "Henon b", value: d.henon_b?.toFixed(4) },
//       { label: "WM Shape", value: d.watermark_shape ? d.watermark_shape.join(" × ") : "—" },
//     ],
//   },
//   {
//     key: "svd",
//     status: "svd",
//     label: "SVD Decomposition",
//     mono: "Singular Value Decomp.",
//     endpoint: (id) => `watermarking/process/${id}/svd/`,
//     hasImage: false,
//     renderData: () => [
//       { label: "Operation", value: "Applied on WM" },
//     ],
//   },
//   {
//     key: "pso",
//     status: "pso",
//     label: "PSO Optimisation",
//     mono: "Particle Swarm",
//     endpoint: (id) => `watermarking/process/${id}/pso/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "α*", value: d.alpha_star?.toFixed(6) },
//       { label: "PSO Cost", value: d.pso_cost?.toFixed(6) },
//       { label: "Particles", value: d.pso_particles },
//       { label: "Iterations", value: d.pso_iterations },
//     ],
//   },
//   {
//     key: "embedding",
//     status: "embedding",
//     label: "Embed Watermark",
//     mono: "IDCT → IDTCWT",
//     endpoint: (id) => `watermarking/process/${id}/embedding/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/output/`,
//     hasImage: true,
//     renderData: (d) => [
//       { label: "PSNR", value: d.psnr_value ? `${d.psnr_value.toFixed(2)} dB` : "—" },
//     ],
//   },
//   {
//     key: "threshold",
//     status: "thresholding",
//     label: "Compute Threshold",
//     mono: "Tamper Detection",
//     endpoint: (id) => `watermarking/process/${id}/threshold/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "Max Drift", value: d.max_benign_drift?.toFixed(6) },
//       { label: "Auto Thresh.", value: d.auto_threshold?.toFixed(6) },
//       { label: "Final Thresh.", value: d.final_threshold?.toFixed(6) },
//     ],
//   },
// ];

// const STATUS_ORDER = [
//   "pending", "resizing", "forwarding", "encrypting",
//   "svd", "pso", "embedding", "thresholding", "completed",
// ];

// function statusIndex(s) {
//   const i = STATUS_ORDER.indexOf(s);
//   return i === -1 ? 0 : i;
// }

// // ─── Step image ────────────────────────────────────────────────────────────
// function StepImage({ endpoint, processId, label }) {
//   const [src, setSrc] = useState(null);
//   const [err, setErr] = useState(false);

//   useEffect(() => {
//     let cancelled = false;
//     API.get(endpoint(processId), { responseType: "blob" })
//       .then((r) => { if (!cancelled) setSrc(URL.createObjectURL(r.data)); })
//       .catch(() => { if (!cancelled) setErr(true); });
//     return () => { cancelled = true; };
//   }, [endpoint, processId]);

//   if (err) return null;
//   if (!src) return <div className="pp-img-placeholder">Loading image…</div>;

//   return (
//     <div className="pp-img-wrap">
//       <img src={src} alt={label} className="pp-img" />
//       <span className="pp-img-label">{label}</span>
//     </div>
//   );
// }

// // ─── Step card ─────────────────────────────────────────────────────────────
// function StepCard({ step, processId, currentStatus, stepData, isLast }) {
//   const curIdx = statusIndex(currentStatus);
//   const stepIdx = STATUS_ORDER.indexOf(step.status);

//   const isDone   = curIdx > stepIdx;
//   const isActive = currentStatus === step.status;
//   const isPending = !isDone && !isActive;

//   return (
//     <div className={`pp-step${isDone ? " pp-step--done" : ""}${isActive ? " pp-step--active" : ""}${isPending ? " pp-step--pending" : ""}`}>

//       {/* track */}
//       <div className="pp-track">
//         <div className={`pp-dot${isDone ? " pp-dot--done" : isActive ? " pp-dot--active" : " pp-dot--pending"}`}>
//           {isDone ? (
//             <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
//               <path d="M1 4.5L4.5 8L11 1" stroke="currentColor" strokeWidth="1.8"
//                 strokeLinecap="round" strokeLinejoin="round" />
//             </svg>
//           ) : isActive ? (
//             <span className="pp-pulse" />
//           ) : (
//             <span className="pp-idle" />
//           )}
//         </div>
//         {!isLast && (
//           <div className={`pp-line${isDone ? " pp-line--done" : isActive ? " pp-line--active" : " pp-line--pending"}`} />
//         )}
//       </div>

//       {/* content */}
//       <div className="pp-content">
//         <div className="pp-row">
//           <div>
//             <span className="pp-mono">{step.mono}</span>
//             <h3 className={`pp-title${isPending ? " pp-title--dim" : ""}`}>{step.label}</h3>
//           </div>
//           <div className="pp-badge-col">
//             {isActive  && <span className="pp-badge pp-badge--active"><span className="pp-bdot" />Processing</span>}
//             {isDone    && <span className="pp-badge pp-badge--done">Complete</span>}
//             {isPending && <span className="pp-badge pp-badge--pending">Waiting</span>}
//           </div>
//         </div>

//         {(isDone || isActive) && stepData && (
//           <div className="pp-body">
//             <div className="pp-stats">
//               {step.renderData(stepData).map((item) => (
//                 <div key={item.label} className="pp-stat">
//                   <span className="pp-stat-label">{item.label}</span>
//                   <span className="pp-stat-value">{item.value ?? "—"}</span>
//                 </div>
//               ))}
//             </div>

//             {isDone && step.hasImage && step.imageEndpoint && (
//               <StepImage endpoint={step.imageEndpoint} processId={processId} label={step.label} />
//             )}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // ─── Main ──────────────────────────────────────────────────────────────────
// export default function PipelineProgress({ processId, onReset }) {
//   const [processStatus, setProcessStatus] = useState("pending");
//   const [progress, setProgress]           = useState(0);
//   const [error, setError]                 = useState(null);
//   const [stepData, setStepData]           = useState({});
//   const [outputUrl, setOutputUrl]         = useState(null);
//   const pollerRef = useRef(null);

//   const fetchStepData = useCallback(async (step) => {
//     try {
//       const res = await API.get(step.endpoint(processId));
//       setStepData((prev) => ({ ...prev, [step.key]: res.data }));
//     } catch (_) {}
//   }, [processId]);

//   useEffect(() => {
//     let active = true;

//     const poll = async () => {
//       try {
//         const res = await API.get(`watermarking/process/${processId}/status`);
//         if (!active) return;

//         const { status: s, progress: p, error: e } = res.data;
//         setProcessStatus(s);
//         setProgress(p ?? 0);
//         if (e) setError(e);

//         const curIdx = statusIndex(s);
//         STEPS.forEach((step) => {
//           if (STATUS_ORDER.indexOf(step.status) < curIdx) {
//             setStepData((prev) => {
//               if (prev[step.key]) return prev;
//               fetchStepData(step);
//               return prev;
//             });
//           }
//         });

//         if (s === "completed") {
//           STEPS.forEach((step) => fetchStepData(step));
//           API.get(`watermarking/process/${processId}/image/output/`, { responseType: "blob" })
//             .then((r) => { if (active) setOutputUrl(URL.createObjectURL(r.data)); })
//             .catch(() => {});
//         }

//         if (s !== "completed" && s !== "failed") {
//           pollerRef.current = setTimeout(poll, 1500);
//         }
//       } catch (_) {
//         if (active) pollerRef.current = setTimeout(poll, 3000);
//       }
//     };

//     poll();
//     return () => { active = false; clearTimeout(pollerRef.current); };
//   }, [processId, fetchStepData]);

//   const downloadImage = () => {
//     if (!outputUrl) return;
//     const a = document.createElement("a");
//     a.href = outputUrl;
//     a.download = `watermarked_${processId}.png`;
//     a.click();
//   };

//   const downloadKey = async () => {
//     try {
//       const res = await API.get(`watermarking/process/${processId}/key/`, { responseType: "blob" });
//       const a = document.createElement("a");
//       a.href = URL.createObjectURL(res.data);
//       a.download = `key_process_${processId}.npz`;
//       a.click();
//     } catch (_) { alert("Key not available yet."); }
//   };

//   const isCompleted = processStatus === "completed";
//   const isFailed    = processStatus === "failed";
//   const activeLabel = STEPS.find((s) => s.status === processStatus)?.label;

//   return (
//     <div className="page">
//       <Topbar />
//       <div className="content pp-outer">

//         {/* ── Header card ── */}
//         <div className="auth-card reveal pp-header-card">
//           <div className="pp-header-top">
//             <div>
//               <p className="eyebrow">Process #{processId}</p>
//               <h2 style={{ fontSize: "clamp(1.3rem,3vw,1.8rem)" }}>
//                 {isFailed ? "Pipeline Failed" : isCompleted ? "Pipeline Complete" : "Processing…"}
//               </h2>
//               {!isCompleted && !isFailed && activeLabel && (
//                 <p className="subtitle" style={{ marginTop: 4, fontSize: "0.88rem" }}>
//                   <span className="pp-running-dot" />{activeLabel}
//                 </p>
//               )}
//             </div>
//             <button className="ghost-btn" onClick={onReset}>← New Upload</button>
//           </div>

//           <div className="pp-bar-track">
//             <div className="pp-bar-fill" style={{
//               width: `${progress}%`,
//               background: isFailed
//                 ? "linear-gradient(90deg, var(--danger), #f87171)"
//                 : "linear-gradient(90deg, var(--primary), #34d399)",
//             }} />
//           </div>
//           <div className="pp-bar-meta">
//             <span className="pp-bar-label">
//               {isFailed ? "Failed" : isCompleted ? "All steps complete" : processStatus}
//             </span>
//             <span className="pp-bar-pct">{progress}%</span>
//           </div>

//           {isFailed && error && (
//             <div className="status error" style={{ marginTop: 12 }}>
//               <strong>Error:</strong> {error}
//             </div>
//           )}
//         </div>

//         {/* ── Steps card ── */}
//         <div className="auth-card pp-steps-card">
//           {STEPS.map((step, i) => (
//             <StepCard
//               key={step.key}
//               step={step}
//               processId={processId}
//               currentStatus={processStatus}
//               stepData={stepData[step.key] || null}
//               isLast={i === STEPS.length - 1}
//             />
//           ))}
//         </div>

//         {/* ── Download card ── */}
//         {isCompleted && (
//           <div className="auth-card reveal pp-dl-card">
//             <p className="eyebrow">Ready to Export</p>
//             <h2 style={{ fontSize: "1.4rem" }}>Your files are ready</h2>
//             <p className="subtitle" style={{ marginTop: 6, fontSize: "0.88rem" }}>
//               Download the watermarked image and encryption key for tamper detection.
//             </p>

//             {outputUrl && (
//               <div className="pp-dl-preview">
//                 <img src={outputUrl} alt="Watermarked output" />
//                 <span className="pp-dl-preview-label">Watermarked Output</span>
//               </div>
//             )}

//             <div className="pp-dl-btns">
//               <button className="primary-btn" onClick={downloadImage} style={{ marginTop: 0 }}>
//                 ↓ Download Image
//               </button>
//               <button className="ghost-btn" onClick={downloadKey}>
//                 ↓ Download Key
//               </button>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* ── Scoped styles ── */}
//       <style>{`
//         .pp-outer {
//           flex-direction: column;
//           align-items: center;
//           gap: 18px;
//           padding: 32px 20px 64px;
//         }

//         /* Cards */
//         .pp-header-card,
//         .pp-steps-card,
//         .pp-dl-card {
//           width: min(620px, 100%);
//         }

//         /* Suppress default auth-card hover for step/dl cards */
//         .pp-steps-card:hover,
//         .pp-dl-card:hover {
//           transform: none;
//           box-shadow: var(--shadow);
//         }

//         /* ── Header ── */
//         .pp-header-top {
//           display: flex;
//           justify-content: space-between;
//           align-items: flex-start;
//           gap: 16px;
//           margin-bottom: 20px;
//         }

//         .pp-running-dot {
//           display: inline-block;
//           width: 7px;
//           height: 7px;
//           border-radius: 50%;
//           background: var(--primary);
//           margin-right: 7px;
//           vertical-align: middle;
//           animation: pp-blink 1.1s ease-in-out infinite;
//         }

//         /* ── Progress bar ── */
//         .pp-bar-track {
//           height: 6px;
//           background: rgba(16,32,38,0.1);
//           border-radius: 99px;
//           overflow: hidden;
//         }

//         .pp-bar-fill {
//           height: 100%;
//           border-radius: 99px;
//           transition: width 0.7s cubic-bezier(0.4,0,0.2,1);
//           box-shadow: 0 0 10px rgba(15,118,110,0.25);
//         }

//         .pp-bar-meta {
//           display: flex;
//           justify-content: space-between;
//           margin-top: 6px;
//         }

//         .pp-bar-label {
//           font: 500 0.75rem/1 "DM Mono", monospace;
//           letter-spacing: 0.08em;
//           text-transform: uppercase;
//           color: var(--ink-500);
//         }

//         .pp-bar-pct {
//           font: 600 0.82rem/1 "DM Mono", monospace;
//           color: var(--primary);
//         }

//         /* ── Steps card ── */
//         .pp-steps-card {
//           padding: clamp(14px, 3vw, 28px);
//         }

//         .pp-step {
//           display: flex;
//           gap: 0;
//         }

//         /* Track */
//         .pp-track {
//           display: flex;
//           flex-direction: column;
//           align-items: center;
//           width: 34px;
//           flex-shrink: 0;
//           padding-top: 16px;
//         }

//         .pp-dot {
//           width: 26px;
//           height: 26px;
//           border-radius: 50%;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           flex-shrink: 0;
//           transition: all 0.3s ease;
//         }

//         .pp-dot--done {
//           background: rgba(15,118,110,0.1);
//           border: 1.5px solid var(--primary);
//           color: var(--primary);
//         }

//         .pp-dot--active {
//           background: rgba(15,118,110,0.07);
//           border: 1.5px solid var(--primary);
//           box-shadow: 0 0 0 4px rgba(15,118,110,0.09);
//         }

//         .pp-dot--pending {
//           background: rgba(16,32,38,0.04);
//           border: 1.5px solid var(--line);
//         }

//         .pp-pulse {
//           display: block;
//           width: 8px;
//           height: 8px;
//           border-radius: 50%;
//           background: var(--primary);
//           animation: pp-pulse 1.2s ease-in-out infinite;
//         }

//         .pp-idle {
//           display: block;
//           width: 6px;
//           height: 6px;
//           border-radius: 50%;
//           background: rgba(16,32,38,0.15);
//         }

//         .pp-line {
//           width: 1.5px;
//           flex: 1;
//           min-height: 16px;
//           margin: 3px 0;
//           border-radius: 2px;
//           transition: background 0.4s ease;
//         }

//         .pp-line--done    { background: var(--primary); opacity: 0.25; }
//         .pp-line--active  { background: linear-gradient(to bottom, var(--primary), transparent); opacity: 0.35; }
//         .pp-line--pending { background: var(--line); }

//         /* Content */
//         .pp-content {
//           flex: 1;
//           padding: 12px 0 12px 14px;
//           border-bottom: 1px solid var(--line);
//           min-width: 0;
//         }

//         .pp-step:last-child .pp-content {
//           border-bottom: none;
//         }

//         .pp-row {
//           display: flex;
//           justify-content: space-between;
//           align-items: flex-start;
//           gap: 12px;
//         }

//         .pp-mono {
//           display: block;
//           font: 500 0.7rem/1 "DM Mono", monospace;
//           letter-spacing: 0.1em;
//           text-transform: uppercase;
//           color: var(--ink-500);
//           margin-bottom: 3px;
//         }

//         .pp-title {
//           margin: 0;
//           font: 600 0.98rem/1.2 "Space Grotesk", sans-serif;
//           color: var(--ink-900);
//           transition: color 0.3s;
//         }

//         .pp-title--dim { color: var(--ink-500) !important; }

//         .pp-badge-col { flex-shrink: 0; padding-top: 2px; }

//         .pp-badge {
//           display: inline-flex;
//           align-items: center;
//           gap: 5px;
//           padding: 3px 9px;
//           border-radius: 99px;
//           font: 500 0.7rem/1 "DM Mono", monospace;
//           letter-spacing: 0.05em;
//           white-space: nowrap;
//         }

//         .pp-badge--active {
//           background: rgba(15,118,110,0.1);
//           border: 1px solid rgba(15,118,110,0.28);
//           color: var(--primary-strong);
//         }

//         .pp-badge--done {
//           background: rgba(15,118,110,0.07);
//           border: 1px solid rgba(15,118,110,0.16);
//           color: var(--primary);
//         }

//         .pp-badge--pending {
//           background: rgba(16,32,38,0.04);
//           border: 1px solid var(--line);
//           color: var(--ink-500);
//         }

//         .pp-bdot {
//           display: block;
//           width: 5px;
//           height: 5px;
//           border-radius: 50%;
//           background: var(--primary);
//           animation: pp-blink 1s ease-in-out infinite;
//         }

//         /* Body */
//         .pp-body {
//           margin-top: 10px;
//           display: flex;
//           flex-direction: column;
//           gap: 10px;
//           padding-bottom: 4px;
//         }

//         .pp-stats {
//           display: flex;
//           flex-wrap: wrap;
//           gap: 6px;
//         }

//         .pp-stat {
//           display: flex;
//           flex-direction: column;
//           gap: 2px;
//           background: rgba(15,118,110,0.05);
//           border: 1px solid rgba(15,118,110,0.12);
//           border-radius: 8px;
//           padding: 6px 10px;
//           min-width: 80px;
//         }

//         .pp-stat-label {
//           font: 500 0.65rem/1 "DM Mono", monospace;
//           text-transform: uppercase;
//           letter-spacing: 0.1em;
//           color: var(--ink-500);
//         }

//         .pp-stat-value {
//           font: 600 0.85rem/1.3 "DM Mono", monospace;
//           color: var(--primary-strong);
//         }

//         /* Images */
//         .pp-img-wrap {
//           position: relative;
//           border-radius: 10px;
//           overflow: hidden;
//           border: 1px solid var(--line);
//           max-width: 240px;
//           box-shadow: 0 4px 14px rgba(11,38,46,0.08);
//         }

//         .pp-img {
//           width: 100%;
//           display: block;
//           max-height: 150px;
//           object-fit: cover;
//         }

//         .pp-img-label {
//           display: block;
//           padding: 5px 10px;
//           background: rgba(247,244,238,0.95);
//           font: 500 0.68rem/1 "DM Mono", monospace;
//           color: var(--ink-500);
//           letter-spacing: 0.07em;
//           text-transform: uppercase;
//         }

//         .pp-img-placeholder {
//           max-width: 240px;
//           height: 56px;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           background: rgba(16,32,38,0.03);
//           border: 1px dashed var(--line);
//           border-radius: 8px;
//           font: 500 0.78rem/1 "DM Mono", monospace;
//           color: var(--ink-500);
//         }

//         /* Download */
//         .pp-dl-card {
//           padding-bottom: 32px;
//         }

//         .pp-dl-preview {
//           margin-top: 18px;
//           border-radius: 12px;
//           overflow: hidden;
//           border: 1px solid var(--line);
//           box-shadow: 0 6px 20px rgba(11,38,46,0.1);
//         }

//         .pp-dl-preview img {
//           width: 100%;
//           display: block;
//           max-height: 220px;
//           object-fit: cover;
//         }

//         .pp-dl-preview-label {
//           display: block;
//           padding: 7px 12px;
//           background: rgba(247,244,238,0.95);
//           font: 500 0.72rem/1 "DM Mono", monospace;
//           color: var(--ink-500);
//           letter-spacing: 0.08em;
//           text-transform: uppercase;
//         }

//         .pp-dl-btns {
//           margin-top: 18px;
//           display: flex;
//           gap: 10px;
//           flex-wrap: wrap;
//         }

//         .pp-dl-btns .primary-btn,
//         .pp-dl-btns .ghost-btn {
//           flex: 1;
//           min-width: 140px;
//           margin-top: 0;
//           text-align: center;
//         }

//         /* Keyframes */
//         @keyframes pp-pulse {
//           0%, 100% { transform: scale(1); opacity: 1; }
//           50% { transform: scale(1.55); opacity: 0.45; }
//         }

//         @keyframes pp-blink {
//           0%, 100% { opacity: 1; }
//           50% { opacity: 0.15; }
//         }

//         /* Mobile */
//         @media (max-width: 640px) {
//           .pp-header-top { flex-direction: column; }
//           .pp-row { flex-direction: column; gap: 6px; }
//         }
//       `}</style>
//     </div>
//   );
// }

// import { useState, useEffect, useRef, useCallback } from "react";
// import API from "../api/api";

// // ─── Step definitions ──────────────────────────────────────────────────────
// const STEPS = [
//   {
//     key: "resizing",
//     status: "resizing",
//     label: "Resize Image",
//     icon: "⬡",
//     endpoint: (id) => `watermarking/process/${id}/resizing/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/resized/`,
//     hasImage: true,
//     renderData: (d) => [
//       { label: "DTCWT Levels", value: d.dtcwt_levels },
//     ],
//   },
//   {
//     key: "forwarding",
//     status: "forwarding",
//     label: "Forward Pipeline",
//     icon: "◈",
//     endpoint: (id) => `watermarking/process/${id}/forward/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "Blocks", value: d.n_blocks },
//       { label: "SV Length", value: d.sv_length },
//       { label: "LL Shape", value: d.LL_shape ? `${d.LL_shape[0]} × ${d.LL_shape[1]}` : "—" },
//     ],
//   },
//   {
//     key: "encryption",
//     status: "encrypting",
//     label: "Henon Encryption",
//     icon: "⬡",
//     endpoint: (id) => `watermarking/process/${id}/encryption/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/wm_encrypted/`,
//     hasImage: true,
//     renderData: (d) => [
//       { label: "Henon a", value: d.henon_a?.toFixed(4) },
//       { label: "Henon b", value: d.henon_b?.toFixed(4) },
//       { label: "Watermark Shape", value: d.watermark_shape ? d.watermark_shape.join(" × ") : "—" },
//     ],
//   },
//   {
//     key: "svd",
//     status: "svd",
//     label: "SVD Decomposition",
//     icon: "◈",
//     endpoint: (id) => `watermarking/process/${id}/svd/`,
//     hasImage: false,
//     renderData: () => [
//       { label: "Operation", value: "SVD applied on watermark" },
//     ],
//   },
//   {
//     key: "pso",
//     status: "pso",
//     label: "PSO Optimisation",
//     icon: "⬡",
//     endpoint: (id) => `watermarking/process/${id}/pso/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "α*", value: d.alpha_star?.toFixed(6) },
//       { label: "PSO Cost", value: d.pso_cost?.toFixed(6) },
//       { label: "Particles", value: d.pso_particles },
//       { label: "Iterations", value: d.pso_iterations },
//     ],
//   },
//   {
//     key: "embedding",
//     status: "embedding",
//     label: "Embed Watermark",
//     icon: "◈",
//     endpoint: (id) => `watermarking/process/${id}/embedding/`,
//     imageEndpoint: (id) => `watermarking/process/${id}/image/output/`,
//     hasImage: true,
//     renderData: (d) => [
//       { label: "PSNR", value: d.psnr_value ? `${d.psnr_value.toFixed(2)} dB` : "—" },
//     ],
//   },
//   {
//     key: "threshold",
//     status: "thresholding",
//     label: "Compute Threshold",
//     icon: "⬡",
//     endpoint: (id) => `watermarking/process/${id}/threshold/`,
//     hasImage: false,
//     renderData: (d) => [
//       { label: "Max Benign Drift", value: d.max_benign_drift?.toFixed(6) },
//       { label: "Auto Threshold", value: d.auto_threshold?.toFixed(6) },
//       { label: "Final Threshold", value: d.final_threshold?.toFixed(6) },
//     ],
//   },
// ];

// const STATUS_ORDER = [
//   "pending", "resizing", "forwarding", "encrypting",
//   "svd", "pso", "embedding", "thresholding", "completed"
// ];

// function statusIndex(s) {
//   const i = STATUS_ORDER.indexOf(s);
//   return i === -1 ? 0 : i;
// }

// // ─── Image viewer ──────────────────────────────────────────────────────────
// function StepImage({ endpoint, processId, label }) {
//   const [src, setSrc] = useState(null);
//   const [err, setErr] = useState(false);

//   useEffect(() => {
//     let cancelled = false;
//     API.get(endpoint(processId), { responseType: "blob" })
//       .then((r) => {
//         if (!cancelled) setSrc(URL.createObjectURL(r.data));
//       })
//       .catch(() => { if (!cancelled) setErr(true); });
//     return () => { cancelled = true; };
//   }, [endpoint, processId]);

//   if (err) return null;
//   if (!src) return (
//     <div style={styles.imgPlaceholder}>
//       <span style={styles.imgPlaceholderText}>Loading image…</span>
//     </div>
//   );
//   return (
//     <div style={styles.imgWrap}>
//       <img src={src} alt={label} style={styles.img} />
//       <span style={styles.imgLabel}>{label}</span>
//     </div>
//   );
// }

// // ─── Single step card ──────────────────────────────────────────────────────
// function StepCard({ step, processId, currentStatus, stepData }) {
//   const curIdx = statusIndex(currentStatus);
//   const stepIdx = STATUS_ORDER.indexOf(step.status);

//   const isDone = curIdx > stepIdx;
//   const isActive = currentStatus === step.status;
//   const isPending = !isDone && !isActive;

//   return (
//     <div style={{
//       ...styles.card,
//       ...(isActive ? styles.cardActive : {}),
//       ...(isDone ? styles.cardDone : {}),
//       ...(isPending ? styles.cardPending : {}),
//     }}>
//       {/* connector line */}
//       <div style={styles.connector}>
//         <div style={{
//           ...styles.connectorLine,
//           background: isDone
//             ? "var(--accent)"
//             : isActive
//               ? "linear-gradient(to bottom, var(--accent), transparent)"
//               : "rgba(255,255,255,0.08)",
//         }} />
//       </div>

//       {/* dot + header */}
//       <div style={styles.cardHeader}>
//         <div style={{
//           ...styles.dot,
//           ...(isActive ? styles.dotActive : {}),
//           ...(isDone ? styles.dotDone : {}),
//           ...(isPending ? styles.dotPending : {}),
//         }}>
//           {isDone ? "✓" : isActive ? <span style={styles.pulse} /> : step.icon}
//         </div>
//         <div style={styles.cardMeta}>
//           <span style={styles.stepNum}>STEP {STATUS_ORDER.indexOf(step.status)}</span>
//           <h3 style={{
//             ...styles.stepLabel,
//             color: isDone ? "var(--accent-light)" : isActive ? "#fff" : "rgba(255,255,255,0.3)",
//           }}>
//             {step.label}
//           </h3>
//           {isActive && (
//             <div style={styles.activePill}>
//               <span style={styles.activeDot} />
//               Processing
//             </div>
//           )}
//           {isDone && (
//             <div style={styles.donePill}>Complete</div>
//           )}
//         </div>
//       </div>

//       {/* expanded content when done */}
//       {(isDone || isActive) && stepData && (
//         <div style={styles.cardBody}>
//           {/* stats */}
//           <div style={styles.statsGrid}>
//             {step.renderData(stepData).map((item) => (
//               <div key={item.label} style={styles.statBox}>
//                 <span style={styles.statLabel}>{item.label}</span>
//                 <span style={styles.statValue}>{item.value ?? "—"}</span>
//               </div>
//             ))}
//           </div>

//           {/* image */}
//           {isDone && step.hasImage && step.imageEndpoint && (
//             <StepImage
//               endpoint={step.imageEndpoint}
//               processId={processId}
//               label={step.label}
//             />
//           )}
//         </div>
//       )}
//     </div>
//   );
// }

// // ─── Main export ───────────────────────────────────────────────────────────
// export default function PipelineProgress({ processId, onReset }) {
//   const [processStatus, setProcessStatus] = useState("pending");
//   const [progress, setProgress] = useState(0);
//   const [error, setError] = useState(null);
//   const [stepData, setStepData] = useState({});
//   const [outputImageUrl, setOutputImageUrl] = useState(null);
//   const pollerRef = useRef(null);

//   // Fetch step data for a completed step
//   const fetchStepData = useCallback(async (step) => {
//     try {
//       const res = await API.get(step.endpoint(processId));
//       setStepData((prev) => ({ ...prev, [step.key]: res.data }));
//     } catch (_) {}
//   }, [processId]);

//   // Poll status
//   useEffect(() => {
//     let active = true;

//     const poll = async () => {
//       try {
//         const res = await API.get(`watermarking/process/${processId}/status`);
//         if (!active) return;

//         const { status: s, progress: p, error: e } = res.data;
//         setProcessStatus(s);
//         setProgress(p ?? 0);
//         if (e) setError(e);

//         // fetch data for steps that are now complete
//         const curIdx = statusIndex(s);
//         STEPS.forEach((step) => {
//           const stepIdx = STATUS_ORDER.indexOf(step.status);
//           if (stepIdx < curIdx) {
//             setStepData((prev) => {
//               if (prev[step.key]) return prev; // already fetched
//               fetchStepData(step);
//               return prev;
//             });
//           }
//         });

//         if (s === "completed") {
//           // fetch all remaining step data
//           STEPS.forEach((step) => fetchStepData(step));
//           // fetch output image
//           API.get(`watermarking/process/${processId}/image/output/`, { responseType: "blob" })
//             .then((r) => { if (active) setOutputImageUrl(URL.createObjectURL(r.data)); })
//             .catch(() => {});
//         }

//         if (s !== "completed" && s !== "failed") {
//           pollerRef.current = setTimeout(poll, 1500);
//         }
//       } catch (_) {
//         if (active) pollerRef.current = setTimeout(poll, 3000);
//       }
//     };

//     poll();
//     return () => {
//       active = false;
//       clearTimeout(pollerRef.current);
//     };
//   }, [processId, fetchStepData]);

//   const handleDownloadKey = async () => {
//     try {
//       const res = await API.get(`watermarking/process/${processId}/key/`, { responseType: "blob" });
//       const url = URL.createObjectURL(res.data);
//       const a = document.createElement("a");
//       a.href = url;
//       a.download = `key_process_${processId}.npz`;
//       a.click();
//     } catch (_) { alert("Key not available yet."); }
//   };

//   const handleDownloadImage = () => {
//     if (!outputImageUrl) return;
//     const a = document.createElement("a");
//     a.href = outputImageUrl;
//     a.download = `watermarked_${processId}.png`;
//     a.click();
//   };

//   const isCompleted = processStatus === "completed";
//   const isFailed = processStatus === "failed";

//   return (
//     <div style={styles.root}>
//       {/* ── Header ── */}
//       <div style={styles.header}>
//         <button style={styles.backBtn} onClick={onReset}>← New Upload</button>
//         <div style={styles.headerCenter}>
//           <h2 style={styles.title}>Watermarking Pipeline</h2>
//           <span style={styles.processId}>Process #{processId}</span>
//         </div>
//         <div style={styles.headerRight} />
//       </div>

//       {/* ── Progress bar ── */}
//       <div style={styles.progressWrap}>
//         <div style={styles.progressTrack}>
//           <div style={{
//             ...styles.progressFill,
//             width: `${progress}%`,
//             background: isFailed
//               ? "linear-gradient(90deg, #ef4444, #f87171)"
//               : "linear-gradient(90deg, var(--accent), var(--accent-light))",
//           }} />
//         </div>
//         <div style={styles.progressRow}>
//           <span style={styles.progressLabel}>
//             {isFailed ? "Failed" : isCompleted ? "Complete" : processStatus.toUpperCase()}
//           </span>
//           <span style={styles.progressPct}>{progress}%</span>
//         </div>
//       </div>

//       {/* ── Error ── */}
//       {isFailed && error && (
//         <div style={styles.errorBox}>
//           <strong>Error:</strong> {error}
//         </div>
//       )}

//       {/* ── Steps ── */}
//       <div style={styles.pipeline}>
//         {STEPS.map((step) => (
//           <StepCard
//             key={step.key}
//             step={step}
//             processId={processId}
//             currentStatus={processStatus}
//             stepData={stepData[step.key] || null}
//           />
//         ))}
//       </div>

//       {/* ── Download section ── */}
//       {isCompleted && (
//         <div style={styles.downloadSection}>
//           <div style={styles.downloadGlow} />
//           <h3 style={styles.downloadTitle}>Pipeline Complete</h3>
//           <p style={styles.downloadSub}>Your watermarked image and encryption key are ready.</p>

//           {outputImageUrl && (
//             <div style={styles.outputPreview}>
//               <img src={outputImageUrl} alt="Watermarked output" style={styles.outputImg} />
//             </div>
//           )}

//           <div style={styles.downloadBtns}>
//             <button style={styles.dlBtnPrimary} onClick={handleDownloadImage}>
//               ↓ Download Image
//             </button>
//             <button style={styles.dlBtnSecondary} onClick={handleDownloadKey}>
//               ↓ Download Key
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// // ─── Styles ────────────────────────────────────────────────────────────────
// const styles = {
//   root: {
//     minHeight: "100vh",
//     background: "linear-gradient(160deg, #0a0f1e 0%, #0d1a2b 50%, #091420 100%)",
//     color: "#fff",
//     fontFamily: "'DM Mono', 'Fira Code', monospace",
//     padding: "0 0 80px",
//     "--accent": "#00d4aa",
//     "--accent-light": "#5eead4",
//   },

//   header: {
//     display: "flex",
//     alignItems: "center",
//     justifyContent: "space-between",
//     padding: "20px 32px",
//     borderBottom: "1px solid rgba(0,212,170,0.12)",
//     backdropFilter: "blur(12px)",
//     position: "sticky",
//     top: 0,
//     zIndex: 10,
//     background: "rgba(10,15,30,0.85)",
//   },
//   backBtn: {
//     background: "rgba(255,255,255,0.05)",
//     border: "1px solid rgba(255,255,255,0.1)",
//     color: "rgba(255,255,255,0.6)",
//     borderRadius: "8px",
//     padding: "8px 14px",
//     cursor: "pointer",
//     fontSize: "13px",
//     fontFamily: "inherit",
//     transition: "all 0.2s",
//   },
//   headerCenter: { textAlign: "center" },
//   headerRight: { width: 120 },
//   title: {
//     margin: 0,
//     fontSize: "18px",
//     fontWeight: 700,
//     letterSpacing: "0.05em",
//     color: "#fff",
//     fontFamily: "'Space Grotesk', sans-serif",
//   },
//   processId: {
//     fontSize: "11px",
//     color: "var(--accent)",
//     letterSpacing: "0.1em",
//   },

//   progressWrap: {
//     padding: "20px 32px 8px",
//   },
//   progressTrack: {
//     height: 4,
//     background: "rgba(255,255,255,0.06)",
//     borderRadius: 4,
//     overflow: "hidden",
//   },
//   progressFill: {
//     height: "100%",
//     borderRadius: 4,
//     transition: "width 0.6s ease",
//     boxShadow: "0 0 12px rgba(0,212,170,0.4)",
//   },
//   progressRow: {
//     display: "flex",
//     justifyContent: "space-between",
//     marginTop: 6,
//   },
//   progressLabel: {
//     fontSize: "10px",
//     letterSpacing: "0.12em",
//     color: "rgba(255,255,255,0.35)",
//   },
//   progressPct: {
//     fontSize: "10px",
//     letterSpacing: "0.08em",
//     color: "var(--accent)",
//   },

//   errorBox: {
//     margin: "12px 32px",
//     padding: "12px 16px",
//     background: "rgba(239,68,68,0.1)",
//     border: "1px solid rgba(239,68,68,0.3)",
//     borderRadius: 8,
//     fontSize: "13px",
//     color: "#fca5a5",
//   },

//   pipeline: {
//     maxWidth: 720,
//     margin: "24px auto 0",
//     padding: "0 24px",
//     display: "flex",
//     flexDirection: "column",
//     gap: 0,
//   },

//   // ── Card ──
//   card: {
//     display: "flex",
//     gap: 0,
//     position: "relative",
//   },

//   connector: {
//     display: "flex",
//     flexDirection: "column",
//     alignItems: "center",
//     width: 40,
//     flexShrink: 0,
//   },
//   connectorLine: {
//     width: 1,
//     flexGrow: 1,
//     minHeight: 60,
//     marginTop: 4,
//   },

//   cardHeader: {
//     display: "flex",
//     alignItems: "flex-start",
//     gap: 14,
//     padding: "16px 0 0",
//     flex: 1,
//   },

//   dot: {
//     width: 32,
//     height: 32,
//     borderRadius: "50%",
//     display: "flex",
//     alignItems: "center",
//     justifyContent: "center",
//     fontSize: "13px",
//     flexShrink: 0,
//     fontWeight: 700,
//     transition: "all 0.3s",
//   },
//   dotDone: {
//     background: "rgba(0,212,170,0.15)",
//     border: "1.5px solid var(--accent)",
//     color: "var(--accent)",
//   },
//   dotActive: {
//     background: "rgba(0,212,170,0.08)",
//     border: "1.5px solid var(--accent)",
//     color: "var(--accent)",
//     boxShadow: "0 0 16px rgba(0,212,170,0.25)",
//     position: "relative",
//   },
//   dotPending: {
//     background: "rgba(255,255,255,0.03)",
//     border: "1.5px solid rgba(255,255,255,0.08)",
//     color: "rgba(255,255,255,0.15)",
//   },

//   pulse: {
//     display: "block",
//     width: 10,
//     height: 10,
//     borderRadius: "50%",
//     background: "var(--accent)",
//     animation: "pulse 1.2s ease-in-out infinite",
//   },

//   cardMeta: {
//     display: "flex",
//     flexDirection: "column",
//     gap: 2,
//     paddingBottom: 8,
//     flex: 1,
//   },
//   stepNum: {
//     fontSize: "9px",
//     letterSpacing: "0.15em",
//     color: "rgba(255,255,255,0.2)",
//   },
//   stepLabel: {
//     fontSize: "15px",
//     fontWeight: 600,
//     margin: 0,
//     fontFamily: "'Space Grotesk', sans-serif",
//     transition: "color 0.3s",
//   },
//   activePill: {
//     display: "inline-flex",
//     alignItems: "center",
//     gap: 5,
//     padding: "2px 8px",
//     background: "rgba(0,212,170,0.1)",
//     border: "1px solid rgba(0,212,170,0.25)",
//     borderRadius: 20,
//     fontSize: "10px",
//     color: "var(--accent)",
//     letterSpacing: "0.05em",
//     width: "fit-content",
//     marginTop: 2,
//   },
//   activeDot: {
//     width: 5,
//     height: 5,
//     borderRadius: "50%",
//     background: "var(--accent)",
//     animation: "blink 1s ease-in-out infinite",
//   },
//   donePill: {
//     display: "inline-flex",
//     padding: "2px 8px",
//     background: "rgba(0,212,170,0.06)",
//     border: "1px solid rgba(0,212,170,0.15)",
//     borderRadius: 20,
//     fontSize: "10px",
//     color: "rgba(0,212,170,0.6)",
//     letterSpacing: "0.05em",
//     width: "fit-content",
//     marginTop: 2,
//   },

//   cardBody: {
//     paddingLeft: 40,
//     paddingBottom: 20,
//     flex: 1,
//     display: "flex",
//     flexDirection: "column",
//     gap: 12,
//   },

//   statsGrid: {
//     display: "grid",
//     gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
//     gap: 8,
//   },
//   statBox: {
//     background: "rgba(255,255,255,0.03)",
//     border: "1px solid rgba(255,255,255,0.06)",
//     borderRadius: 8,
//     padding: "8px 12px",
//     display: "flex",
//     flexDirection: "column",
//     gap: 2,
//   },
//   statLabel: {
//     fontSize: "9px",
//     letterSpacing: "0.12em",
//     color: "rgba(255,255,255,0.3)",
//     textTransform: "uppercase",
//   },
//   statValue: {
//     fontSize: "14px",
//     fontWeight: 600,
//     color: "var(--accent-light, #5eead4)",
//     fontFamily: "inherit",
//   },

//   imgWrap: {
//     position: "relative",
//     borderRadius: 10,
//     overflow: "hidden",
//     border: "1px solid rgba(0,212,170,0.15)",
//     maxWidth: 320,
//   },
//   img: {
//     width: "100%",
//     display: "block",
//     maxHeight: 200,
//     objectFit: "cover",
//   },
//   imgLabel: {
//     position: "absolute",
//     bottom: 0,
//     left: 0,
//     right: 0,
//     padding: "6px 10px",
//     background: "rgba(0,0,0,0.5)",
//     fontSize: "10px",
//     color: "rgba(255,255,255,0.6)",
//     letterSpacing: "0.06em",
//   },
//   imgPlaceholder: {
//     height: 80,
//     display: "flex",
//     alignItems: "center",
//     justifyContent: "center",
//     background: "rgba(255,255,255,0.02)",
//     borderRadius: 8,
//     border: "1px solid rgba(255,255,255,0.05)",
//     maxWidth: 320,
//   },
//   imgPlaceholderText: {
//     fontSize: "11px",
//     color: "rgba(255,255,255,0.2)",
//   },

//   // ── Download section ──
//   downloadSection: {
//     maxWidth: 720,
//     margin: "40px auto 0",
//     padding: "40px 24px",
//     position: "relative",
//     textAlign: "center",
//     borderTop: "1px solid rgba(0,212,170,0.15)",
//   },
//   downloadGlow: {
//     position: "absolute",
//     top: 0,
//     left: "50%",
//     transform: "translateX(-50%)",
//     width: 300,
//     height: 200,
//     background: "radial-gradient(ellipse, rgba(0,212,170,0.06), transparent 70%)",
//     pointerEvents: "none",
//   },
//   downloadTitle: {
//     fontSize: "22px",
//     fontWeight: 700,
//     margin: "0 0 8px",
//     fontFamily: "'Space Grotesk', sans-serif",
//     color: "#fff",
//   },
//   downloadSub: {
//     fontSize: "13px",
//     color: "rgba(255,255,255,0.4)",
//     margin: "0 0 24px",
//   },
//   outputPreview: {
//     display: "inline-block",
//     borderRadius: 12,
//     overflow: "hidden",
//     border: "1px solid rgba(0,212,170,0.25)",
//     marginBottom: 24,
//     boxShadow: "0 0 40px rgba(0,212,170,0.1)",
//     maxWidth: 360,
//     width: "100%",
//   },
//   outputImg: {
//     width: "100%",
//     display: "block",
//     maxHeight: 280,
//     objectFit: "cover",
//   },
//   downloadBtns: {
//     display: "flex",
//     gap: 12,
//     justifyContent: "center",
//     flexWrap: "wrap",
//   },
//   dlBtnPrimary: {
//     padding: "12px 28px",
//     background: "linear-gradient(135deg, #00d4aa, #0ea5e9)",
//     border: "none",
//     borderRadius: 10,
//     color: "#0a0f1e",
//     fontWeight: 700,
//     fontSize: "14px",
//     fontFamily: "'DM Mono', monospace",
//     cursor: "pointer",
//     letterSpacing: "0.04em",
//     boxShadow: "0 0 24px rgba(0,212,170,0.3)",
//     transition: "transform 0.15s, box-shadow 0.15s",
//   },
//   dlBtnSecondary: {
//     padding: "12px 28px",
//     background: "rgba(255,255,255,0.05)",
//     border: "1px solid rgba(255,255,255,0.15)",
//     borderRadius: 10,
//     color: "rgba(255,255,255,0.8)",
//     fontWeight: 600,
//     fontSize: "14px",
//     fontFamily: "'DM Mono', monospace",
//     cursor: "pointer",
//     letterSpacing: "0.04em",
//     transition: "all 0.15s",
//   },

//   cardDone: {},
//   cardActive: {},
//   cardPending: {},
// };

// // Inject keyframes
// const styleEl = document.createElement("style");
// styleEl.textContent = `
//   @keyframes pulse {
//     0%, 100% { transform: scale(1); opacity: 1; }
//     50% { transform: scale(1.4); opacity: 0.6; }
//   }
//   @keyframes blink {
//     0%, 100% { opacity: 1; }
//     50% { opacity: 0.2; }
//   }
// `;
// if (typeof document !== "undefined") document.head.appendChild(styleEl);


