import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "../components/ThemeToggle";
import {
  registerHost,
  requestHostEmailCode,
  verifyHostEmailCode,
} from "../utils/api";

const steps = [
  {
    id: "account",
    title: "Create your host account",
    subtitle: "Share a few details to set up payouts and visibility.",
  },
  {
    id: "download",
    title: "Install the ComputeX Host app",
    subtitle: "Download the agent and sign in to link your PC.",
  },
  {
    id: "ready",
    title: "You are ready to host",
    subtitle: "Your PC will start reporting status and availability.",
  },
];

export default function HostRegister() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    location: "",
    payoutHandle: "",
    gpu: "",
  });
  const [emailCode, setEmailCode] = useState("");
  const [emailStatus, setEmailStatus] = useState("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const [devEmailCode, setDevEmailCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step]);

  const goNext = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSendEmailCode = async () => {
    if (!form.email) {
      setEmailMessage("Enter your email first.");
      return;
    }
    setLoading(true);
    setApiError("");
    try {
      const res = await requestHostEmailCode(form.email);
      setEmailStatus("sent");
      setEmailMessage("Verification code sent. Check your inbox.");
      setDevEmailCode(res?.dev_code || "");
    } catch (err) {
      setApiError(err?.response?.data?.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!form.email || !emailCode) {
      setEmailMessage("Enter the verification code.");
      return;
    }
    setLoading(true);
    setApiError("");
    try {
      const res = await verifyHostEmailCode(form.email, emailCode.trim());
      if (res?.verified) {
        setEmailStatus("verified");
        setEmailMessage("Email verified.");
      }
    } catch (err) {
      setApiError(err?.response?.data?.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setApiError("");
    if (!form.name || !form.email || !form.password) {
      setApiError("Name, email, and password are required.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setApiError("Passwords do not match.");
      return;
    }
    if (emailStatus !== "verified") {
      setApiError("Please verify your email before continuing.");
      return;
    }

    setLoading(true);
    try {
      await registerHost({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone,
        location: form.location,
        payoutHandle: form.payoutHandle,
        gpu: form.gpu,
      });
      goNext();
    } catch (err) {
      setApiError(err?.response?.data?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition">
      <header className="w-full flex justify-between items-center p-4">
        <div className="flex items-center gap-3">
          <a href="/" className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
            ComputeX
          </a>
          <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Host Registration
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600">
            Back to login
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 px-6 pb-12">
        <div className="relative mx-auto max-w-6xl grid lg:grid-cols-[1.1fr,1fr] gap-8 items-start">
          <motion.div
            className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-gradient-to-r from-[#2563EB] to-[#22C1EE] blur-3xl opacity-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.25 }}
            transition={{ duration: 1.2 }}
          />
          <motion.div
            className="absolute -bottom-16 right-8 w-56 h-56 rounded-full bg-gradient-to-r from-[#60a5fa] to-[#9BE7FF] blur-3xl opacity-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ duration: 1.2, delay: 0.2 }}
          />

          <section className="relative z-10 space-y-6">
            <div className="auth-card text-left">
              <p className="text-sm uppercase tracking-widest text-blue-500 font-semibold">Become a Host</p>
              <h1 className="mt-3 text-3xl font-extrabold text-gray-900 dark:text-gray-100">
                Turn your PC into a ComputeX host in minutes.
              </h1>
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                Hosts share idle compute power and earn as workloads run. This wizard registers your account,
                installs the agent, and links your machine when you sign in from the app.
              </p>
            </div>

            <div className="auth-card text-left space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">What happens next</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">Live telemetry</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Your app streams health, usage, and availability.</p>
                </div>
                <div className="p-3 rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">Secure sessions</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">We can start containers and orchestrate workloads.</p>
                </div>
                <div className="p-3 rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">Flexible payouts</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Choose your payout handle during setup.</p>
                </div>
                <div className="p-3 rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">Instant linking</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sign in from the host app to register your machine.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="relative z-10">
            <div className="auth-card text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Step {step + 1} of {steps.length}</p>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{steps[step].title}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{steps[step].subtitle}</p>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  {steps.map((item, index) => (
                    <div key={item.id} className="flex items-center">
                      <div
                        className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ${
                          index <= step
                            ? "bg-gradient-to-r from-[#2563EB] to-[#22C1EE] text-white"
                            : "bg-white/70 dark:bg-slate-800/70 text-gray-500"
                        }`}
                      >
                        {index + 1}
                      </div>
                      {index < steps.length - 1 && (
                        <div className={`w-6 h-1 ${index < step ? "bg-blue-400" : "bg-gray-200 dark:bg-gray-700"}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2563EB] via-[#22C1EE] to-[#9BE7FF]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {apiError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm p-3">
                  {apiError}
                </div>
              )}

              <div className="mt-6">
                <AnimatePresence mode="wait">
                  {step === 0 && (
                    <motion.div
                      key="step-account"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-500">Full name</label>
                          <input
                            className="input mt-1"
                            placeholder="Jane Doe"
                            value={form.name}
                            onChange={(event) => updateForm("name", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">Email address</label>
                          <input
                            className="input mt-1"
                            placeholder="jane@computex.io"
                            type="email"
                            value={form.email}
                            onChange={(event) => updateForm("email", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">Password</label>
                          <input
                            className="input mt-1"
                            type="password"
                            placeholder="Create a password"
                            value={form.password}
                            onChange={(event) => updateForm("password", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">Confirm password</label>
                          <input
                            className="input mt-1"
                            type="password"
                            placeholder="Repeat password"
                            value={form.confirmPassword}
                            onChange={(event) => updateForm("confirmPassword", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">Phone</label>
                          <input
                            className="input mt-1"
                            placeholder="+1 555 123 456"
                            value={form.phone}
                            onChange={(event) => updateForm("phone", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">Location</label>
                          <input
                            className="input mt-1"
                            placeholder="City, Country"
                            value={form.location}
                            onChange={(event) => updateForm("location", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">Payout handle</label>
                          <input
                            className="input mt-1"
                            placeholder="PayPal, bank, or crypto"
                            value={form.payoutHandle}
                            onChange={(event) => updateForm("payoutHandle", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">Primary GPU</label>
                          <select
                            className="input mt-1"
                            value={form.gpu}
                            onChange={(event) => updateForm("gpu", event.target.value)}
                          >
                            <option value="">Choose GPU</option>
                            <option value="NVIDIA RTX">NVIDIA RTX</option>
                            <option value="AMD Radeon">AMD Radeon</option>
                            <option value="Integrated">Integrated / none</option>
                          </select>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60 p-4 space-y-3">
                        <div className="flex flex-wrap gap-3 items-center">
                          <button
                            onClick={handleSendEmailCode}
                            type="button"
                            className="px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-500/40 dark:text-blue-300 dark:hover:bg-blue-900/30"
                            disabled={loading}
                          >
                            {emailStatus === "sent" ? "Resend code" : "Send verification code"}
                          </button>
                          <span
                            className={`text-xs font-semibold ${
                              emailStatus === "verified"
                                ? "text-green-600"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {emailStatus === "verified" ? "Email verified" : "Email not verified"}
                          </span>
                        </div>
                        <div className="grid sm:grid-cols-[1fr,auto] gap-3">
                          <input
                            className="input"
                            placeholder="Enter verification code"
                            value={emailCode}
                            onChange={(event) => setEmailCode(event.target.value)}
                          />
                          <button
                            onClick={handleVerifyEmail}
                            type="button"
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
                            disabled={loading}
                          >
                            Verify email
                          </button>
                        </div>
                        {emailMessage && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{emailMessage}</p>
                        )}
                        {devEmailCode && (
                          <p className="text-xs text-blue-600 dark:text-blue-300">
                            Dev code: {devEmailCode}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {step === 1 && (
                    <motion.div
                      key="step-download"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60 p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          Download the ComputeX Host app and run the installer on the PC you want to register.
                          After installation, sign in with the same email and password to link your machine.
                        </p>
                        <a href="#" className="primary-btn inline-block text-center mt-4">
                          Download ComputeX Host (fake link)
                        </a>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60">
                          <p className="text-xs text-gray-500">OS</p>
                          <p className="font-semibold text-gray-800 dark:text-gray-100">Windows 10/11</p>
                        </div>
                        <div className="p-3 rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60">
                          <p className="text-xs text-gray-500">RAM</p>
                          <p className="font-semibold text-gray-800 dark:text-gray-100">8 GB minimum</p>
                        </div>
                        <div className="p-3 rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60">
                          <p className="text-xs text-gray-500">Network</p>
                          <p className="font-semibold text-gray-800 dark:text-gray-100">20 Mbps up</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60 p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          Sign in from the host app to instantly register the machine with your ComputeX account.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div
                      key="step-ready"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="rounded-xl border border-white/20 bg-white/70 dark:bg-slate-900/60 p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          Your host is now registered. You can monitor health, earnings, and active sessions
                          from the dashboard.
                        </p>
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                          <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/70 border">
                            <p className="text-xs text-gray-500">Status</p>
                            <p className="font-semibold text-green-600">Awaiting first workload</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/70 border">
                            <p className="text-xs text-gray-500">Next action</p>
                            <p className="font-semibold text-gray-800 dark:text-gray-100">Keep the app online</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={goBack}
                  disabled={step === 0 || loading}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    step === 0 || loading
                      ? "border-gray-200 text-gray-400 cursor-not-allowed"
                      : "border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-slate-800"
                  }`}
                  type="button"
                >
                  Back
                </button>

                {step === 0 && (
                  <button onClick={handleRegister} className="primary-btn" type="button" disabled={loading}>
                    {loading ? "Saving..." : "Continue"}
                  </button>
                )}

                {step === 1 && (
                  <button onClick={goNext} className="primary-btn" type="button" disabled={loading}>
                    I have signed in on the host app
                  </button>
                )}

                {step === 2 && (
                  <a href="/dashboard" className="primary-btn text-center">
                    Go to dashboard
                  </a>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
        {new Date().getFullYear()} ComputeX Host Network
      </footer>
    </div>
  );
}
