import { useEffect, useState } from "react";
import API from "../api/api";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem("role") === "admin");
  const navigate = useNavigate();

  const refreshRole = async () => {
    try {
      const res = await API.get("admin/dashboard/");
      if (res?.status === 200) {
        setIsAdmin(true);
        localStorage.setItem("role", "admin");
        return;
      }
      setIsAdmin(false);
    } catch {
      setIsAdmin(false);
      if (localStorage.getItem("role") !== "admin") {
        localStorage.setItem("role", "user");
      }
    }
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      const res = await API.get("tasks/");
      setTasks(res.data || []);
      setMsg("");
    } catch (err) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }
      setMsg("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    refreshRole();
  }, []);

  const handleCreateTask = async () => {
    if (!title.trim()) {
      setMsg("Task title is required");
      return;
    }

    try {
      const res = await API.post("tasks/create/", { title: title.trim() });
      setTasks((prev) => [...prev, res.data]);
      setTitle("");
      setMsg("Task created");
    } catch (err) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }
      setMsg("Failed to create task");
    }
  };

  const handleToggle = async (task) => {
    try {
      const res = await API.put(`tasks/${task.id}/update/`, {
        completed: !task.completed,
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? res.data : t)));
    } catch (err) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }
      setMsg("Failed to update task");
    }
  };

  const handleDelete = async (id) => {
    try {
      await API.delete(`tasks/${id}/delete/`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }
      setMsg("Failed to delete task");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  };

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.completed).length;
  const openTasks = totalTasks - doneTasks;

  return (
    <div className="screen dashboard-screen">
      <div className="grain" aria-hidden="true" />
      <div className="dashboard-shell reveal">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">PrimetradeAI</p>
            <h2>{isAdmin ? "Admin Command Center" : "Task Dashboard"}</h2>
            <p className="subtitle">
              {isAdmin
                ? "Monitor team momentum and system health at a glance."
                : "Track what matters and ship faster."}
            </p>
          </div>
          <button className="ghost-btn" onClick={handleLogout}>Logout</button>
        </div>

        {isAdmin && (
          <div className="admin-panel">
            <div className="admin-card">
              <p className="admin-card-label">Total Tasks</p>
              <h3>{totalTasks}</h3>
            </div>
            <div className="admin-card">
              <p className="admin-card-label">Open Tasks</p>
              <h3>{openTasks}</h3>
            </div>
            <div className="admin-card">
              <p className="admin-card-label">Completed</p>
              <h3>{doneTasks}</h3>
            </div>
          </div>
        )}

        <div className="task-compose">
          <input
            className="field"
            placeholder={isAdmin ? "Create and assign a task" : "Add a new task"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="primary-btn" onClick={handleCreateTask}>
            Add Task
          </button>
        </div>

        {msg && <p className="status">{msg}</p>}

        {loading ? (
          <p className="loading">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <p>No tasks yet.</p>
            <p className="subtitle">Create one above to get started.</p>
          </div>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className={`task-item ${task.completed ? "done" : ""}`}>
                <label className="task-label">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggle(task)}
                  />
                  <span>{task.title}</span>
                </label>
                <button className="danger-btn" onClick={() => handleDelete(task.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}