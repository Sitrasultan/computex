import { Navigate, Route, Routes } from "react-router-dom";
import WelcomePage from "./pages/WelcomePage";
import DashboardHome from "./pages/DashboardHome";
import HostRegister from "./pages/HostRegister";
import AdminDashboard from "./pages/AdminDashboard";
import SessionLaunchPage from "./pages/SessionLaunchPage";
import SessionFilesPage from "./pages/SessionFilesPage";
import WorkspaceManagerPage from "./pages/WorkspaceManagerPage";
import WorkspaceToolsPage from "./pages/WorkspaceToolsPage";
import DocsGettingStartedPage from "./pages/DocsGettingStartedPage";
import DocsHostInstallationPage from "./pages/DocsHostInstallationPage";
import DocsTroubleshootingPage from "./pages/DocsTroubleshootingPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/dashboard" element={<DashboardHome />} />
      <Route path="/sessions/new" element={<SessionLaunchPage />} />
      <Route path="/sessions/:id" element={<SessionFilesPage />} />
      <Route path="/workspaces" element={<WorkspaceManagerPage />} />
      <Route path="/workspaces/new" element={<WorkspaceToolsPage />} />
      <Route path="/workspaces/:id/tools" element={<WorkspaceToolsPage />} />
      <Route path="/docs/getting-started" element={<DocsGettingStartedPage />} />
      <Route path="/docs/host-installation" element={<DocsHostInstallationPage />} />
      <Route path="/docs/troubleshooting" element={<DocsTroubleshootingPage />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/host/register" element={<HostRegister />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

