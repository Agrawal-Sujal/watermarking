import { useNavigate } from "react-router-dom";
import Topbar from "./TopBar";
export default function Verify() {
  const navigate = useNavigate();

 return (
  <div className="page">
    <Topbar />

    <div className="content">
      <div className="auth-card reveal">
        <p className="eyebrow">WatermarkX</p>
        <h2>Verify Watermark</h2>
        <p className="subtitle">
          Upload a watermarked image to check authenticity.
        </p>

        <label className="upload-card">
          <span>Upload Watermarked Image</span>
          <input type="file" hidden />
        </label>

        <button className="primary-btn">
          Verify
        </button>
      </div>
    </div>
  </div>
);
}