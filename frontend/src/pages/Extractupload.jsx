import { useState } from "react";
import Topbar from "./TopBar";
import API from "../api/api";
import ExtractProgress from "./ExtractProgress";

export default function ExtractUpload() {
  const [watermarkedImage, setWatermarkedImage] = useState(null);
  const [processId, setProcessId]               = useState("");
  const [loading, setLoading]                   = useState(false);
  const [extractionId, setExtractionId]         = useState(null);
  const [fieldError, setFieldError]             = useState(null);

  const handleExtract = async () => {
    setFieldError(null);

    if (!watermarkedImage) {
      setFieldError("Please upload the watermarked image.");
      return;
    }
    if (!processId || isNaN(Number(processId)) || Number(processId) < 1) {
      setFieldError("Please enter a valid Process ID.");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("watermarked_image", watermarkedImage);
      formData.append("process_id", processId);

      const res = await API.post("watermarking/extract/submit/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setExtractionId(res.data.extraction_id);
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || "Error starting extraction.";
      setFieldError(msg);
      setLoading(false);
    }
  };

  if (extractionId) {
    return (
      <ExtractProgress
        extractionId={extractionId}
        onReset={() => {
          setExtractionId(null);
          setWatermarkedImage(null);
          setProcessId("");
          setLoading(false);
        }}
      />
    );
  }

  return (
    <div className="page">
      <Topbar />

      <div className="content">
        <div className="upload-wrapper">

          <h2 className="page-title">Extract Watermark</h2>
          <p className="subtitle center">
            Upload a watermarked image and its process ID to recover the embedded watermark.
          </p>

          <div className="auth-card reveal">

            {/* Watermarked image upload */}
            <div className="vu-field">
              <label className="vu-label">Watermarked Image</label>
              {!watermarkedImage ? (
                <label className="upload-card">
                  <span>Upload Watermarked Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => setWatermarkedImage(e.target.files[0])}
                  />
                </label>
              ) : (
                <div className="preview-box">
                  <img src={URL.createObjectURL(watermarkedImage)} alt="preview" />
                  <button className="remove-btn" onClick={() => setWatermarkedImage(null)}>✕</button>
                </div>
              )}
            </div>

            {/* Process ID */}
            <div className="vu-field" style={{ marginTop: 18 }}>
              <label className="vu-label">Embedding Process ID</label>
              <input
                type="number"
                className="vu-input"
                placeholder="e.g. 42"
                value={processId}
                min={1}
                onChange={(e) => setProcessId(e.target.value)}
              />
              <p className="vu-hint">
                The process ID from your original embedding job — used to load the matching .npz key.
              </p>
            </div>

            {/* Error */}
            {fieldError && (
              <div className="status error" style={{ marginTop: 10, fontSize: "0.82rem" }}>
                {fieldError}
              </div>
            )}

            <div className="center-btn" style={{ marginTop: 20 }}>
              <button
                className="primary-btn"
                onClick={handleExtract}
                disabled={loading}
              >
                {loading ? "Starting…" : "Extract Watermark"}
              </button>
            </div>

            {loading && <div className="spinner" />}
          </div>
        </div>
      </div>

      <style>{`
        .vu-field { display: flex; flex-direction: column; gap: 6px; }

        .vu-label {
          font: 600 0.78rem/1 "DM Mono", monospace;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-500);
        }

        .vu-input {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 14px;
          border: 1.5px solid var(--line);
          border-radius: var(--radius-md, 8px);
          background: rgba(247,244,238,0.5);
          font: 600 0.96rem/1 "DM Mono", monospace;
          color: var(--ink-900);
          outline: none;
          transition: border-color 0.2s;
          -moz-appearance: textfield;
        }

        .vu-input::-webkit-outer-spin-button,
        .vu-input::-webkit-inner-spin-button { -webkit-appearance: none; }

        .vu-input:focus { border-color: var(--primary); }
        .vu-input::placeholder { color: var(--ink-400, #9ca3af); font-weight: 500; }

        .vu-hint {
          margin: 0;
          font: 500 0.72rem/1.5 "DM Mono", monospace;
          color: var(--ink-500);
        }
      `}</style>
    </div>
  );
}