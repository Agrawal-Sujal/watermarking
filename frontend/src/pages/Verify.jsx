import { useState } from "react";
import Topbar from "./TopBar";
import API from "../api/api";
import VerifyProgress from "./VerifyProgress";

export default function VerifyUpload() {
  const [receivedImage, setReceivedImage] = useState(null);
  const [processId, setProcessIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationId, setVerificationId] = useState(null);
  const [fieldError, setFieldError] = useState(null);

  const handleVerify = async () => {
    setFieldError(null);

    if (!receivedImage) {
      setFieldError("Please upload the image to verify.");
      return;
    }
    if (!processId || isNaN(Number(processId))) {
      setFieldError("Please enter a valid Process ID.");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("received_image", receivedImage);
      formData.append("process_id", processId);

      const res = await API.post("watermarking/verify/submit/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setVerificationId(res.data.verification_id);
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || "Error starting verification.";
      setFieldError(msg);
      setLoading(false);
    }
  };

  if (verificationId) {
    return (
      <VerifyProgress
        verificationId={verificationId}
        onReset={() => {
          setVerificationId(null);
          setReceivedImage(null);
          setProcessIdInput("");
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

          <h2 className="page-title">Verify Integrity</h2>
          <p className="subtitle center">
            Upload a watermarked image and its process ID to detect any tampering.
          </p>

          <div className="auth-card reveal">

            {/* Image upload */}
            <div className="vu-field">
              <label className="vu-label">Received Image</label>
              {!receivedImage ? (
                <label className="upload-card">
                  <span>Upload Image to Verify</span>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => setReceivedImage(e.target.files[0])}
                  />
                </label>
              ) : (
                <div className="preview-box">
                  <img src={URL.createObjectURL(receivedImage)} alt="preview" />
                  <button className="remove-btn" onClick={() => setReceivedImage(null)}>✕</button>
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
                onChange={(e) => setProcessIdInput(e.target.value)}
                min={1}
              />
              <p className="vu-hint">
                The process ID from your embedding job — used to load the matching key.
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
                onClick={handleVerify}
                disabled={loading}
              >
                {loading ? "Starting…" : "Run Verification"}
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