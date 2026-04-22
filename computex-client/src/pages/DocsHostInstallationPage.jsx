import { Link } from "react-router-dom";

export default function DocsHostInstallationPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-3xl font-bold">Host Agent Installation</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Install and pair your host so ComputeX can route sessions to available resources.
        </p>
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>Download and run the host agent package on your machine.</li>
          <li>Sign in with your ComputeX account.</li>
          <li>Complete pairing from the dashboard prompts.</li>
          <li>Confirm the host appears online before launching sessions.</li>
        </ol>
        <Link to="/dashboard" className="inline-block text-sky-600 dark:text-sky-400 hover:underline text-sm">
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}
