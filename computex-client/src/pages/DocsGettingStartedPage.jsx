import { Link } from "react-router-dom";

export default function DocsGettingStartedPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">ComputeX Setup Guide</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            This guide is for onboarding a brand-new Windows PC to run ComputeX host workloads reliably. It covers
            planning, system requirements, Docker + WSL setup, host pairing, production checks, and what to monitor
            before you accept real sessions.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-4">
          <h2 className="text-xl font-semibold">What You Will Set Up</h2>
          <ol className="list-decimal ml-5 space-y-2 text-sm leading-relaxed">
            <li>Prepare Windows with virtualization support for container workloads.</li>
            <li>Install and validate WSL 2.</li>
            <li>Install and configure Docker Desktop with WSL integration.</li>
            <li>Install and sign in to the ComputeX host agent.</li>
            <li>Pair the host to your account and run a launch test.</li>
            <li>Apply troubleshooting and stability checks before going live.</li>
          </ol>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-4">
          <h2 className="text-xl font-semibold">Minimum Requirements</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            ComputeX sessions run inside Docker containers. WSL 2 is required for stable Linux-based runtime support on
            Windows hosts.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-white/10">
                  <th className="py-2 pr-4 font-semibold">Component</th>
                  <th className="py-2 pr-4 font-semibold">Recommended</th>
                  <th className="py-2 font-semibold">Why it matters</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <td className="py-2 pr-4">OS</td>
                  <td className="py-2 pr-4">Windows 11 (or Windows 10 with WSL 2 support)</td>
                  <td className="py-2">Required for modern virtualization + Docker Desktop compatibility.</td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <td className="py-2 pr-4">CPU</td>
                  <td className="py-2 pr-4">4+ cores with VT-x/AMD-V enabled</td>
                  <td className="py-2">Container density and compile speed depend heavily on CPU.</td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <td className="py-2 pr-4">RAM</td>
                  <td className="py-2 pr-4">16 GB (8 GB minimum)</td>
                  <td className="py-2">Prevents OOM failures when running sessions and host tools together.</td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <td className="py-2 pr-4">Storage</td>
                  <td className="py-2 pr-4">100 GB free SSD space</td>
                  <td className="py-2">Images, containers, caches, and workspace persistence grow quickly.</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Network</td>
                  <td className="py-2 pr-4">Stable broadband, low packet loss</td>
                  <td className="py-2">Required for host heartbeats, container pulls, and user session routing.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/30 p-5 space-y-4">
          <h2 className="text-xl font-semibold">Quick Start Path</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            If this is your first setup, follow the pages in this order:
          </p>
          <ol className="list-decimal ml-5 space-y-2 text-sm">
            <li>
              <Link className="text-sky-600 dark:text-sky-400 hover:underline" to="/docs/host-installation">
                Host Installation (Full New-PC Setup)
              </Link>{" "}
              for detailed Docker + WSL + agent onboarding.
            </li>
            <li>
              <Link className="text-sky-600 dark:text-sky-400 hover:underline" to="/docs/troubleshooting">
                Troubleshooting
              </Link>{" "}
              if pairing, launch, or connectivity checks fail.
            </li>
          </ol>
        </section>

        <section className="rounded-2xl border border-amber-200/70 dark:border-amber-300/20 bg-amber-50/70 dark:bg-amber-950/20 p-5 space-y-3">
          <h2 className="text-lg font-semibold">Production Readiness Checklist</h2>
          <ul className="list-disc ml-5 space-y-2 text-sm leading-relaxed">
            <li>Host status is online in dashboard and heartbeats are updating.</li>
            <li>Docker Desktop starts automatically after reboot.</li>
            <li>WSL 2 backend is healthy and no distro startup errors are present.</li>
            <li>At least one test session launches and can be stopped cleanly.</li>
            <li>Disk usage policy is defined for image/cache cleanup.</li>
          </ul>
        </section>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Need exact step-by-step commands? Continue to Host Installation for the complete setup walkthrough.
        </p>

        <Link to="/dashboard" className="inline-block text-sky-600 dark:text-sky-400 hover:underline text-sm">
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}
