import { useState } from "react";
import API from "../api/api";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [data, setData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!data.username.trim() || !data.password.trim()) {
      setError("Username and password are required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await API.post("auth/login/", data);
      localStorage.setItem("token", res.data.access);
      navigate("/upload");
    } catch (err) {
      setError(err?.response?.data?.error || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen auth-screen">
      <div className="grain" />
      <div className="auth-card reveal">
        <p className="eyebrow">WatermarkX</p>
        <h2>Welcome back</h2>
        <p className="subtitle">
          Upload and protect your images with invisible watermarking.
        </p>

        <div className="form-grid">
          <input
            className="field"
            placeholder="Username"
            value={data.username}
            onChange={(e) => setData({ ...data, username: e.target.value })}
          />

          <input
            className="field"
            type="password"
            placeholder="Password"
            value={data.password}
            onChange={(e) => setData({ ...data, password: e.target.value })}
          />

          <button className="primary-btn" onClick={handleLogin} disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </div>

        {error && <p className="status error">{error}</p>}

        <button
          className="text-link"
          type="button"
          onClick={() => navigate("/register")}
        >
          Don&apos;t have an account? Register
        </button>
      </div>
    </div>
  );
}