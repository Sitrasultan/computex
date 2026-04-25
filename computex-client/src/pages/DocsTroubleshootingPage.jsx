import { Link } from "react-router-dom";

export default function DocsTroubleshootingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">Troubleshooting Guide</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Use this diagnostics flow when host pairing, launch requests, or runtime setup fail. Work top-to-bottom and
            verify each layer before retrying session launch.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Layer 1: Windows + Virtualization</h2>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Confirm virtualization is enabled in BIOS/UEFI.</li>
            <li>Confirm Hyper-V/WSL features are enabled in Windows Features.</li>
            <li>Run this command and check virtualization output:</li>
          </ul>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            systeminfo | findstr /i "Virtualization Hyper-V"
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            If virtualization is disabled, Docker containers cannot start correctly.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Layer 2: WSL 2 Health</h2>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Check WSL status and distro state:</li>
          </ul>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            wsl --status{"\n"}
            wsl -l -v
          </div>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>If WSL appears broken, restart it:</li>
          </ul>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            wsl --shutdown
          </div>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Then relaunch Docker Desktop and retry.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Layer 3: Docker Engine Diagnostics</h2>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Verify engine connectivity and runtime metadata:</li>
          </ul>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            docker version{"\n"}
            docker info
          </div>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Run a baseline container test:</li>
          </ul>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            docker run hello-world
          </div>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>If this fails, fix Docker before investigating ComputeX-specific behavior.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Layer 4: Host Pairing and Presence</h2>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Confirm host agent is signed in with the same ComputeX account used in dashboard.</li>
            <li>Verify host status is online and last-seen updates are recent.</li>
            <li>If offline, restart host app and ensure network/firewall rules allow outbound communication.</li>
            <li>Re-run pairing if host identity changed or machine was re-imaged.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Layer 5: Session Launch Problems</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-white/10">
                  <th className="py-2 pr-4 font-semibold">Symptom</th>
                  <th className="py-2 pr-4 font-semibold">Likely cause</th>
                  <th className="py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <td className="py-2 pr-4">Session stuck in starting</td>
                  <td className="py-2 pr-4">Host cannot start container or image pull delays</td>
                  <td className="py-2">Check Docker health, free disk, and host logs. Retry launch.</td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <td className="py-2 pr-4">No host available</td>
                  <td className="py-2 pr-4">All hosts offline or overloaded</td>
                  <td className="py-2">Bring host online, reduce load, verify telemetry freshness.</td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <td className="py-2 pr-4">Session fails quickly</td>
                  <td className="py-2 pr-4">Runtime image/config mismatch</td>
                  <td className="py-2">Retry with default runtime and inspect host logs for launch errors.</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Session stops unexpectedly</td>
                  <td className="py-2 pr-4">Inactivity policy or host resource pressure</td>
                  <td className="py-2">Check inactivity window, memory pressure, and host uptime stability.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Disk and Cleanup Issues</h2>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Low disk space can block new container launches and image updates.</li>
            <li>Remove unused Docker artifacts periodically:</li>
          </ul>
          <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
            docker system df{"\n"}
            docker system prune -f
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Run cleanup during maintenance windows to avoid interrupting active sessions.
          </p>
        </section>

        <section className="rounded-2xl border border-amber-200/70 dark:border-amber-300/20 bg-amber-50/70 dark:bg-amber-950/20 p-5 space-y-3">
          <h2 className="text-lg font-semibold">Escalation Data to Collect</h2>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Timestamp and session ID of failed launches.</li>
            <li>Host ID and current host status from dashboard.</li>
            <li>Output from `docker version`, `docker info`, and `wsl --status`.</li>
            <li>Any visible error shown in host logs or dashboard alerts.</li>
          </ul>
        </section>

        <Link to="/dashboard" className="inline-block text-sky-600 dark:text-sky-400 hover:underline text-sm">
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}
