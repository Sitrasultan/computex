import { useState } from "react";
import { motion } from "framer-motion";
import { signup } from "../utils/api";

export default function SignupForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (form.password !== form.confirm) return setError("Passwords do not match");
    if (form.password.length < 8) return setError("Password too short");

    setLoading(true);
    try {
      await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        password_confirmation: form.confirm,
      });

      setSuccess("Account created successfully!");
      setForm({ name: "", email: "", password: "", confirm: "" });
    } catch (err) {
      const apiError = err.response?.data?.message || err.response?.data?.errors?.email?.[0];
      setError(apiError || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.form onSubmit={submit} className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}>
      <input className="input" name="name" placeholder="Full name" value={form.name} onChange={handle} required autoComplete="name" />
      <input className="input" name="email" placeholder="Email" value={form.email} onChange={handle} required autoComplete="email" />
      <input className="input" name="password" placeholder="Password" type="password" value={form.password} onChange={handle} required autoComplete="new-password" />
      <input className="input" name="confirm" placeholder="Confirm password" type="password" value={form.confirm} onChange={handle} required autoComplete="new-password" />

      {error && <div className="text-sm text-red-600">{error}</div>}
      {success && <div className="text-sm text-green-500">{success}</div>}

      <motion.button whileTap={{ scale: 0.98 }} className="primary-btn" type="submit" disabled={loading}>
        {loading ? "Creating account..." : "Create account"}
      </motion.button>
    </motion.form>
  );
}