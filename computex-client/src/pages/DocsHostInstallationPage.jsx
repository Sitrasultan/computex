import { Link } from "react-router-dom";

export default function DocsHostInstallationPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">Host Installation: New PC Setup</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Use this runbook to set up a fresh Windows machine for ComputeX hosting. Follow sections in order to avoid
            common startup issues and partial installs.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Phase 1: Pre-Flight Checks</h2>
          <ol className="list-decimal ml-5 space-y-2 text-sm leading-relaxed">
            <li>Sign in to Windows with an administrator account.</li>
            <li>Install pending Windows updates and reboot once.</li>
            <li>Ensure virtualization is enabled in BIOS/UEFI (Intel VT-x or AMD-V / SVM).</li>
            <li>Close legacy VM tools if they conflict with Hyper-V/WSL settings.</li>
          </ol>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            systeminfo | findstr /i "Virtualization Hyper-V"
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            If virtualization shows disabled, enable it in BIOS first, then return to this guide.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Phase 2: Install WSL 2</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            ComputeX on Windows relies on Docker Desktop with the WSL 2 backend.
          </p>
          <ol className="list-decimal ml-5 space-y-2 text-sm leading-relaxed">
            <li>Open PowerShell as Administrator.</li>
            <li>Install WSL:</li>
          </ol>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            wsl --install
          </div>
          <ol className="list-decimal ml-5 space-y-2 text-sm leading-relaxed" start={3}>
            <li>Reboot when prompted.</li>
            <li>Verify WSL version and default architecture:</li>
          </ol>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            wsl --status{"\n"}
            wsl -l -v
          </div>
          <ol className="list-decimal ml-5 space-y-2 text-sm leading-relaxed" start={5}>
            <li>Ensure default version is 2:</li>
          </ol>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            wsl --set-default-version 2
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Phase 3: Install Docker Desktop</h2>
          <ol className="list-decimal ml-5 space-y-2 text-sm leading-relaxed">
            <li>Install Docker Desktop for Windows.</li>
            <li>Launch Docker Desktop and complete first-run initialization.</li>
            <li>In Docker settings, enable Use WSL 2 based engine.</li>
            <li>In Docker WSL Integration, enable your default distro.</li>
            <li>Apply and restart Docker Desktop.</li>
          </ol>
          <p className="text-sm text-slate-600 dark:text-slate-300">Validation commands:</p>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            docker version{"\n"}
            docker info{"\n"}
            docker run hello-world
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            `hello-world` must complete successfully before you continue.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Phase 4: Resource Tuning (Recommended)</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Prevent session instability by reserving enough resources for containers.
          </p>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Docker CPU: allocate at least 50% of host cores for medium workloads.</li>
            <li>Docker memory: allocate 6-10 GB on a 16 GB machine.</li>
            <li>Swap: keep enabled to reduce hard failures under burst load.</li>
            <li>Disk image size: ensure enough space for multiple ComputeX images.</li>
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            If you host many concurrent sessions, increase memory/CPU gradually and observe host telemetry.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Phase 5: Install and Pair ComputeX Host Agent</h2>
          <ol className="list-decimal ml-5 space-y-2 text-sm leading-relaxed">
            <li>Install the ComputeX host package on the same machine where Docker is configured.</li>
            <li>Sign in to the host app using your ComputeX account.</li>
            <li>Open dashboard host pairing and complete the pairing flow.</li>
            <li>Confirm host status changes to online.</li>
          </ol>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Required result: Host is visible in dashboard with fresh last-seen updates and active heartbeat telemetry.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Phase 6: Post-Install Validation</h2>
          <ol className="list-decimal ml-5 space-y-2 text-sm leading-relaxed">
            <li>Launch a test coding session from dashboard.</li>
            <li>Open the session and create a sample file.</li>
            <li>Stop the session from dashboard.</li>
            <li>Confirm the session appears in Recent Sessions and transitions cleanly to stopped.</li>
            <li>Reboot the machine and verify Docker + host app recover automatically.</li>
          </ol>
        </section>

        <section className="rounded-2xl border border-rose-200/70 dark:border-rose-300/20 bg-rose-50/70 dark:bg-rose-950/20 p-5 space-y-3">
          <h2 className="text-lg font-semibold">Common Setup Mistakes to Avoid</h2>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Installing Docker before enabling virtualization and WSL 2.</li>
            <li>Skipping reboot steps after WSL feature installation.</li>
            <li>Running host agent without confirming Docker engine health.</li>
            <li>Ignoring disk pressure until session launches fail.</li>
            <li>Using unstable networks for production host machines.</li>
          </ul>
        </section>

        <Link to="/dashboard" className="inline-block text-sky-600 dark:text-sky-400 hover:underline text-sm">
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}
