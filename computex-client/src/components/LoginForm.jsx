import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { login } from "../utils/api";

export default function LoginForm() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(form);
      navigate("/dashboard");
    } catch (err) {
      const apiError = err.response?.data?.message || err.response?.data?.errors?.email?.[0];
      setError(apiError || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.form onSubmit={submit} className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <input className="input" name="email" value={form.email} onChange={handle} placeholder="Email" type="email" required />
      <div className="relative">
        <input className="input pr-12" name="password" value={form.password} onChange={handle} placeholder="Password" type={show ? "text" : "password"} required />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-2 text-sm text-gray-500">
          {show ? "Hide" : "Show"}
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <motion.button whileTap={{ scale: 0.98 }} className="primary-btn" type="submit" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </motion.button>
    </motion.form>
  );
}