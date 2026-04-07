import { useState, useRef } from "react";
import Topbar from "./TopBar";
import API from "../api/api";

/* ── Attack order ──────────────────────────────────── */
const ATTACK_ORDER = [
  { key: "gaussian_noise",       name: "Gaussian Noise",       desc: "Additive Gaussian noise (σ=25)" },
  { key: "salt_pepper",          name: "Salt & Pepper Noise",  desc: "Random salt-and-pepper noise (2% pixels)" },
  { key: "median_filter",        name: "Median Filtering",     desc: "3×3 median filter" },
  { key: "gaussian_lowpass",     name: "Gaussian Low-pass",    desc: "5×5 Gaussian blur" },
  { key: "jpeg_compression",     name: "JPEG Compression",     desc: "JPEG quality = 50" },
  { key: "jpeg2000_compression", name: "JPEG2000 Compression", desc: "JPEG2000 compression" },
  { key: "rotation",             name: "Rotation Attack",      desc: "5° rotation with reflection padding" },
  { key: "scaling",              name: "Scaling Attack",       desc: "Scale down to 80% then back up" },
  { key: "translation",          name: "Translation Attack",   desc: "Shift by (10, 10) px with reflection" },
  { key: "sharpening",           name: "Sharpening Attack",    desc: "Laplacian sharpening kernel" },
  { key: "combined",             name: "Combined Attacks",     desc: "Gaussian noise + JPEG + median filter" },
];

/* ── Small components ─────────────────────────────── */
function DetectionBadge({ detected }) {
  return detected
    ? <span className="ana-badge ana-badge-detected">Detected</span>
    : <span className="ana-badge ana-badge-undetected">Undetected</span>;
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="ana-minibar-track">
      <div className="ana-minibar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/* ── Image preview modal ──────────────────────────── */
function ImageModal({ src, title, onClose }) {
  if (!src) return null;
  return (
    <div className="ana-modal-backdrop" onClick={onClose}>
      <div className="ana-modal" onClick={e => e.stopPropagation()}>
        <div className="ana-modal-header">
          <span className="ana-modal-title">{title}</span>
          <button className="ana-modal-close" onClick={onClose}>✕</button>
        </div>
        <img src={src} alt={title} className="ana-modal-img" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
export default function Analysis() {
  const [watermarkedImage, setWatermarkedImage] = useState(null);
  const [processId, setProcessId] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentAttack, setCurrentAttack] = useState(null);
  const [results, setResults] = useState([]);
  const [baseline, setBaseline] = useState(null);
  const [error, setError] = useState(null);
  const [modalImg, setModalImg] = useState(null);
  const [modalTitle, setModalTitle] = useState("");
  const abortRef = useRef(false);

  const handleAnalyze = async () => {
    setError(null);
    setResults([]);
    setBaseline(null);
    abortRef.current = false;

    if (!watermarkedImage) { setError("Please upload the watermarked image."); return; }
    if (!processId || isNaN(Number(processId)) || Number(processId) < 1) {
      setError("Please enter a valid Process ID."); return;
    }

    setLoading(true);

    try {
      /* ─── Step 1: Baseline ─────────────────── */
      setCurrentAttack("Baseline check…");
      const baseForm = new FormData();
      baseForm.append("watermarked_image", watermarkedImage);
      baseForm.append("process_id", processId);

      const baseRes = await API.post("watermarking/analysis/baseline/", baseForm, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      setBaseline(baseRes.data);

      if (abortRef.current) return;

      /* ─── Step 2: One attack at a time ─────── */
      for (let i = 0; i < ATTACK_ORDER.length; i++) {
        if (abortRef.current) break;

        const atk = ATTACK_ORDER[i];
        setCurrentAttack(`Running ${atk.name} (${i + 1}/${ATTACK_ORDER.length})…`);

        const form = new FormData();
        form.append("watermarked_image", watermarkedImage);
        form.append("process_id", processId);
        form.append("attack_key", atk.key);

        try {
          const res = await API.post("watermarking/analysis/attack/", form, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 120000,
          });
          setResults(prev => [...prev, res.data]);
        } catch (err) {
          const msg = err?.response?.data?.error || err.message;
          setResults(prev => [...prev, {
            attack_key: atk.key,
            attack_name: atk.name,
            description: atk.desc,
            status: "error",
            error: msg,
          }]);
        }
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      setError(msg);
    } finally {
      setLoading(false);
      setCurrentAttack(null);
    }
  };

  const handleReset = () => {
    abortRef.current = true;
    setWatermarkedImage(null);
    setProcessId("");
    setResults([]);
    setBaseline(null);
    setError(null);
    setLoading(false);
    setCurrentAttack(null);
  };

  /* Counts */
  const successResults = results.filter(r => r.status === "success");
  const detected = successResults.filter(r => r.tamper_detected).length;
  const undetected = successResults.filter(r => !r.tamper_detected).length;
  const errored = results.filter(r => r.status === "error").length;

  return (
    <div className="page">
      <Topbar />

      <div className="content">
        <div className="ana-wrapper">
          <h2 className="page-title">Robustness Analysis</h2>
          <p className="subtitle center">
            Test how resistant your watermarked image is against various attacks.
            Upload the watermarked image and its process ID to evaluate tamper detection resilience.
          </p>

          {/* ── Upload card ──────────────────────────── */}
          <div className="auth-card reveal ana-upload-card">
            <div className="ana-form-grid">
              <div className="vu-field">
                <label className="vu-label">Watermarked Image</label>
                {!watermarkedImage ? (
                  <label className="upload-card">
                    <span>Upload Watermarked Image</span>
                    <input type="file" accept="image/*" hidden
                      onChange={(e) => setWatermarkedImage(e.target.files[0])} />
                  </label>
                ) : (
                  <>
                    <div className="preview-box">
                      <img src={URL.createObjectURL(watermarkedImage)} alt="preview" />
                      <button className="remove-btn" onClick={() => { setWatermarkedImage(null); setResults([]); }}>✕</button>
                    </div>
                    <button className="ana-view-btn" style={{ marginTop: 8, alignSelf: "flex-start" }}
                      onClick={() => { setModalImg(URL.createObjectURL(watermarkedImage)); setModalTitle("Watermarked Image"); }}>
                      View Watermarked Image
                    </button>
                  </>
                )}
              </div>
              <div className="vu-field">
                <label className="vu-label">Embedding Process ID</label>
                <input type="number" className="vu-input" placeholder="e.g. 42"
                  value={processId} min={1}
                  onChange={(e) => setProcessId(e.target.value)} />
                <p className="vu-hint">The process ID from your original embedding — used to load the key for tamper detection.</p>
              </div>
            </div>

            {error && <div className="status error" style={{ marginTop: 12, fontSize: "0.82rem" }}>{error}</div>}

            <div className="cmp-actions" style={{ marginTop: 20 }}>
              <button className="primary-btn" onClick={handleAnalyze} disabled={loading}>
                {loading ? "Analyzing…" : "Run Analysis"}
              </button>
              {(results.length > 0 || loading) && (
                <button className="ghost-btn" onClick={handleReset}>
                  {loading ? "Stop" : "Reset"}
                </button>
              )}
            </div>

            {loading && currentAttack && (
              <div className="ana-progress-bar-wrap">
                <div className="ana-progress-status">{currentAttack}</div>
                <div className="ana-progress-track">
                  <div className="ana-progress-fill"
                    style={{ width: `${((results.length + 1) / (ATTACK_ORDER.length + 1)) * 100}%` }} />
                </div>
                <div className="ana-progress-pct">
                  {results.length}/{ATTACK_ORDER.length} attacks completed
                </div>
              </div>
            )}
          </div>

          {/* ── Results ─────────────────────────────── */}
          {(baseline || results.length > 0) && (
            <div className="ana-results reveal">
              {baseline && (
                <div className={`ana-baseline ${baseline.tamper_detected ? "ana-baseline-warn" : "ana-baseline-ok"}`}>
                  <span className="ana-baseline-label">Baseline (no attack):</span>
                  <span>{baseline.tamper_detected
                    ? `Tamper detected — ${baseline.tampered_blocks}/${baseline.total_blocks} blocks (${baseline.tampered_fraction}%)`
                    : `Authentic — 0/${baseline.total_blocks} blocks tampered`}</span>
                </div>
              )}

              {successResults.length > 0 && (
                <div className="ana-summary">
                  <div className="ana-pill ana-pill-detected">
                    <span className="ana-pill-num">{detected}</span>
                    <span className="ana-pill-label">Detected</span>
                  </div>
                  <div className="ana-pill ana-pill-undetected">
                    <span className="ana-pill-num">{undetected}</span>
                    <span className="ana-pill-label">Undetected</span>
                  </div>
                  {errored > 0 && (
                    <div className="ana-pill ana-pill-error">
                      <span className="ana-pill-num">{errored}</span>
                      <span className="ana-pill-label">Errors</span>
                    </div>
                  )}
                  <div className="ana-pill ana-pill-total">
                    <span className="ana-pill-num">{results.length}</span>
                    <span className="ana-pill-label">/ {ATTACK_ORDER.length}</span>
                  </div>
                </div>
              )}

              {results.length > 0 && (
                <div className="ana-table-wrap">
                  <table className="ana-table">
                    <thead>
                      <tr>
                        <th>Attack</th>
                        <th>Pixels Changed</th>
                        <th>% Changed</th>
                        <th>PSNR (dB)</th>
                        <th>NC</th>
                        <th>Tampered Blocks</th>
                        <th>Tamper %</th>
                        <th>Detection</th>
                        <th>Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, idx) => (
                        <tr key={r.attack_key} className={`ana-row-enter ${r.status === "error" ? "ana-row-error" : ""}`}
                            style={{ animationDelay: `${idx * 0.05}s` }}>
                          <td>
                            <div className="ana-atk-name">{r.attack_name}</div>
                            <div className="ana-atk-desc">{r.description}</div>
                          </td>
                          {r.status === "error" ? (
                            <td colSpan={8} className="ana-err-cell">Error: {r.error}</td>
                          ) : (
                            <>
                              <td>
                                <span className="ana-num">{r.pixels_changed.toLocaleString()}</span>
                                <span className="ana-dim"> / {r.total_pixels.toLocaleString()}</span>
                              </td>
                              <td>
                                <div className="ana-pct-cell">
                                  <span className="ana-num">{r.percent_changed}%</span>
                                  <MiniBar value={r.percent_changed} max={100} color="rgba(139,92,246,0.6)" />
                                </div>
                              </td>
                              <td>
                                <span className="ana-num">{r.psnr === null || r.psnr === Infinity ? "∞" : r.psnr ?? "—"}</span>
                              </td>
                              <td>
                                <span className="ana-num">{r.nc !== null && r.nc !== undefined ? r.nc : "—"}</span>
                              </td>
                              <td>
                                <span className="ana-num">{r.tampered_blocks}</span>
                                <span className="ana-dim"> / {r.total_blocks}</span>
                              </td>
                              <td>
                                <div className="ana-pct-cell">
                                  <span className="ana-num">{r.tampered_fraction}%</span>
                                  <MiniBar value={r.tampered_fraction} max={100}
                                    color={r.tamper_detected ? "rgba(16,185,129,0.7)" : "rgba(239,68,68,0.5)"} />
                                </div>
                              </td>
                              <td><DetectionBadge detected={r.tamper_detected} /></td>
                              <td>
                                {r.attacked_image && (
                                  <button className="ana-view-btn"
                                    onClick={() => { setModalImg(r.attacked_image); setModalTitle(r.attack_name); }}>
                                    View
                                  </button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                      {/* Placeholder rows for pending attacks */}
                      {loading && ATTACK_ORDER.slice(results.length).map((atk, idx) => (
                        <tr key={atk.key} className="ana-row-pending">
                          <td>
                            <div className="ana-atk-name">{atk.name}</div>
                            <div className="ana-atk-desc">{atk.desc}</div>
                          </td>
                          <td colSpan={8}>
                            {idx === 0
                              ? <span className="ana-running-dot">Running…</span>
                              : <span className="ana-pending-text">Pending</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Image Modal ──────────────────────────── */}
      <ImageModal src={modalImg} title={modalTitle} onClose={() => setModalImg(null)} />

      {/* ── Scoped styles ────────────────────────── */}
      <style>{`
        .ana-wrapper { width: 100%; max-width: 1100px; text-align: center; }
        .ana-upload-card { width: 100%; max-width: 1100px; text-align: left; }
        .ana-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 640px) { .ana-form-grid { grid-template-columns: 1fr; } }

        /* Progress */
        .ana-progress-bar-wrap {
          margin-top: 16px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .ana-progress-status {
          font: 600 0.82rem/1 "Space Grotesk", sans-serif;
          color: var(--primary);
        }
        .ana-progress-track {
          width: 100%; height: 6px; border-radius: 3px;
          background: rgba(16, 32, 38, 0.08); overflow: hidden;
        }
        .ana-progress-fill {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, var(--primary), #10b981);
          transition: width 0.5s ease;
        }
        .ana-progress-pct {
          font: 500 0.72rem/1 "DM Mono", monospace;
          color: var(--ink-500);
        }

        /* Results */
        .ana-results { margin-top: 28px; text-align: left; }

        .ana-baseline {
          padding: 12px 18px; border-radius: 10px;
          font: 500 0.88rem/1.4 "Space Grotesk", sans-serif;
          margin-bottom: 18px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
        }
        .ana-baseline-ok { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.35); color: #065f46; }
        .ana-baseline-warn { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.35); color: #92400e; }
        .ana-baseline-label { font-weight: 700; }

        /* Summary */
        .ana-summary { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .ana-pill { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px; border: 1px solid; }
        .ana-pill-num { font: 700 1.4rem/1 "Space Grotesk", sans-serif; }
        .ana-pill-label { font: 500 0.82rem/1 "Space Grotesk", sans-serif; }
        .ana-pill-detected { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.4); color: #065f46; }
        .ana-pill-undetected { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.35); color: #991b1b; }
        .ana-pill-error { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.35); color: #92400e; }
        .ana-pill-total { background: rgba(99,102,241,0.08); border-color: rgba(99,102,241,0.3); color: #3730a3; }

        /* Table */
        .ana-table-wrap {
          overflow-x: auto; border: 1px solid var(--line); border-radius: 14px;
          background: rgba(255,255,255,0.85); backdrop-filter: blur(6px);
        }
        .ana-table { width: 100%; border-collapse: collapse; font: 400 0.84rem/1.4 "Space Grotesk", sans-serif; }
        .ana-table thead { background: rgba(15,118,110,0.06); }
        .ana-table th {
          padding: 12px 10px; text-align: left;
          font: 600 0.68rem/1 "DM Mono", monospace;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ink-500); border-bottom: 1px solid var(--line); white-space: nowrap;
        }
        .ana-table td { padding: 10px 10px; border-bottom: 1px solid rgba(16,32,38,0.06); vertical-align: middle; }
        .ana-table tbody tr:last-child td { border-bottom: none; }
        .ana-table tbody tr:hover { background: rgba(15,118,110,0.03); }

        .ana-atk-name { font-weight: 600; color: var(--ink-900); margin-bottom: 2px; }
        .ana-atk-desc { font: 400 0.72rem/1.3 "Space Grotesk", sans-serif; color: var(--ink-500); }
        .ana-num { font: 600 0.84rem/1 "DM Mono", monospace; color: var(--ink-900); }
        .ana-dim { font: 400 0.72rem/1 "DM Mono", monospace; color: var(--ink-500); }
        .ana-pct-cell { display: flex; flex-direction: column; gap: 4px; }
        .ana-err-cell { color: var(--danger); font-style: italic; font-size: 0.82rem; }
        .ana-row-error { background: rgba(239,68,68,0.04); }

        /* Row entrance animation */
        @keyframes rowSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ana-row-enter { animation: rowSlideIn 0.35s ease-out forwards; }

        /* Pending rows */
        .ana-row-pending td { color: var(--ink-400); }
        .ana-pending-text { font: 400 0.78rem/1 "Space Grotesk", sans-serif; color: var(--ink-400); }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .ana-running-dot {
          font: 600 0.78rem/1 "Space Grotesk", sans-serif;
          color: var(--primary); animation: pulse 1.2s ease-in-out infinite;
        }

        /* Mini bar */
        .ana-minibar-track { width: 100%; height: 4px; border-radius: 2px; background: rgba(16,32,38,0.08); overflow: hidden; }
        .ana-minibar-fill { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(.4,0,.2,1); }

        /* Badge */
        .ana-badge {
          display: inline-block; padding: 4px 10px; border-radius: 6px;
          font: 600 0.68rem/1 "DM Mono", monospace;
          letter-spacing: 0.04em; text-transform: uppercase;
        }
        .ana-badge-detected { background: rgba(16,185,129,0.15); color: #065f46; border: 1px solid rgba(16,185,129,0.3); }
        .ana-badge-undetected { background: rgba(239,68,68,0.1); color: #991b1b; border: 1px solid rgba(239,68,68,0.3); }

        /* View button */
        .ana-view-btn {
          padding: 4px 12px; border-radius: 6px; border: 1px solid var(--line);
          background: rgba(255,255,255,0.8); font: 600 0.72rem/1 "DM Mono", monospace;
          color: var(--primary); cursor: pointer; transition: all 0.2s;
        }
        .ana-view-btn:hover { background: var(--primary); color: #fff; border-color: var(--primary); }

        /* ── Modal ───────────────────────────────── */
        .ana-modal-backdrop {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ana-modal {
          background: #fff; border-radius: 16px; overflow: hidden;
          max-width: 600px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          animation: modalPop 0.25s ease;
        }
        @keyframes modalPop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .ana-modal-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 20px; border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        .ana-modal-title { font: 700 1rem/1 "Space Grotesk", sans-serif; color: var(--ink-900); }
        .ana-modal-close {
          width: 30px; height: 30px; border-radius: 50%; border: none;
          background: rgba(0,0,0,0.05); cursor: pointer; font-size: 14px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.2s;
        }
        .ana-modal-close:hover { background: rgba(239,68,68,0.15); color: #ef4444; }
        .ana-modal-img { width: 100%; display: block; }

        /* ── Form fields ─────────────────────────── */
        .vu-field { display: flex; flex-direction: column; gap: 6px; }
        .vu-label {
          font: 600 0.78rem/1 "DM Mono", monospace;
          letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);
        }
        .vu-input {
          width: 100%; box-sizing: border-box; padding: 11px 14px;
          border: 1.5px solid var(--line); border-radius: 8px;
          background: rgba(247,244,238,0.5);
          font: 600 0.96rem/1 "DM Mono", monospace; color: var(--ink-900);
          outline: none; transition: border-color 0.2s; -moz-appearance: textfield;
        }
        .vu-input::-webkit-outer-spin-button, .vu-input::-webkit-inner-spin-button { -webkit-appearance: none; }
        .vu-input:focus { border-color: var(--primary); }
        .vu-input::placeholder { color: var(--ink-400, #9ca3af); font-weight: 500; }
        .vu-hint { margin: 0; font: 500 0.72rem/1.5 "DM Mono", monospace; color: var(--ink-500); }

        .ghost-btn {
          padding: 10px 24px; border-radius: 10px;
          border: 1.5px solid var(--line); background: transparent;
          font: 600 0.88rem/1 "Space Grotesk", sans-serif;
          color: var(--ink-600); cursor: pointer; transition: all 0.2s;
        }
        .ghost-btn:hover { border-color: var(--ink-400); color: var(--ink-900); }
      `}</style>
    </div>
  );
}
