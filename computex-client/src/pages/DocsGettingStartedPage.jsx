import { Link } from "react-router-dom";

export default function DocsGettingStartedPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-3xl font-bold">Getting Started</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Welcome to ComputeX. Use the dashboard to launch sessions, review activity, and monitor your credit usage.
        </p>
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>Sign in from the home page.</li>
          <li>Open the dashboard and launch a compute session.</li>
          <li>Use the session page to access files and track progress.</li>
          <li>Review billing usage in the Credits card.</li>
        </ol>
        <Link to="/dashboard" className="inline-block text-sky-600 dark:text-sky-400 hover:underline text-sm">
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}
