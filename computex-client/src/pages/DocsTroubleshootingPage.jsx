import { Link } from "react-router-dom";

export default function DocsTroubleshootingPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-3xl font-bold">Troubleshooting Connectivity</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          If sessions or hosts are not connecting, use this quick checklist before opening support requests.
        </p>
        <ul className="list-disc ml-5 space-y-2 text-sm">
          <li>Ensure your host is online and signed in.</li>
          <li>Confirm no firewall rules are blocking required ports.</li>
          <li>Refresh the dashboard and retry session launch.</li>
          <li>Check server logs if launch state remains pending.</li>
        </ul>
        <Link to="/dashboard" className="inline-block text-sky-600 dark:text-sky-400 hover:underline text-sm">
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}
