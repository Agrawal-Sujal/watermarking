import { useState } from "react";
import API from "../api/api";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [data, setData] = useState({
    username: "",
    password: "",
  });

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (!data.username.trim() || !data.password.trim()) {
      setMsg("Username and password are required");
      return;
    }

    try {
      setLoading(true);
      await API.post("auth/register/", data);
      setMsg("Account created successfully 🎉");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setMsg(err?.response?.data?.error || "Error registering user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen auth-screen">
      <div className="grain" />
      <div className="auth-card reveal">
        <p className="eyebrow">WatermarkX</p>
        <h2>Create account</h2>
        <p className="subtitle">
          Protect your images with secure watermarking.
        </p>

        <div className="form-grid">
          <input
            className="field"
            placeholder="Username"
            value={data.username}
            onChange={(e) =>
              setData({ ...data, username: e.target.value })
            }
          />

          <input
            className="field"
            type="password"
            placeholder="Password"
            value={data.password}
            onChange={(e) =>
              setData({ ...data, password: e.target.value })
            }
          />

          <button
            className="primary-btn"
            onClick={handleRegister}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </div>

        {msg && (
          <p className={`status ${msg.includes("success") ? "ok" : "error"}`}>
            {msg}
          </p>
        )}

        <button
          className="text-link"
          type="button"
          onClick={() => navigate("/login")}
        >
          Already have an account? Login
        </button>
      </div>
    </div>
  );
}