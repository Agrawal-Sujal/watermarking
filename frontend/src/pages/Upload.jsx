import { useState } from "react";
import Topbar from "./TopBar";
import API from "../api/api"; // ✅ your axios instance

export default function Upload() {
  const [image, setImage] = useState(null);
  const [watermark, setWatermark] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (!image || !watermark) {
      alert("Please upload both files");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("original_image", image);
      formData.append("watermark_image", watermark);

      const res = await API.post("watermarking/upload/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log(res.data);
      alert("Watermarking completed ✅");

    } catch (err) {
      console.error(err);
      alert("Error processing image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <Topbar />

      <div className="content">
        <div className="upload-wrapper">

          <h2 className="page-title">Upload & Protect</h2>
          <p className="subtitle center">
            Upload your image and watermark to generate a secure version.
          </p>

          <div className="auth-card reveal">

            <div className="upload-grid">

              {/* IMAGE */}
              <div className="upload-section">
                {!image ? (
                  <label className="upload-card">
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => setImage(e.target.files[0])}
                    />
                  </label>
                ) : (
                  <div className="preview-box">
                    <img src={URL.createObjectURL(image)} alt="preview" />
                    <button
                      className="remove-btn"
                      onClick={() => setImage(null)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* WATERMARK */}
              <div className="upload-section">
                {!watermark ? (
                  <label className="upload-card">
                    <span>Upload Watermark</span>
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => setWatermark(e.target.files[0])}
                    />
                  </label>
                ) : (
                  <div className="preview-box">
                    <img src={URL.createObjectURL(watermark)} alt="preview" />
                    <button
                      className="remove-btn"
                      onClick={() => setWatermark(null)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* BUTTON */}
            <div className="center-btn">
              <button
                className="primary-btn"
                onClick={handleStart}
                disabled={loading}
              >
                {loading ? "Processing..." : "Start Processing"}
              </button>
            </div>

            {/* SPINNER */}
            {loading && <div className="spinner" />}

          </div>

        </div>
      </div>
    </div>
  );
}