import { Navigate, Route, Routes } from "react-router-dom";
import WelcomePage from "./pages/WelcomePage";
import DashboardHome from "./pages/DashboardHome";
import HostRegister from "./pages/HostRegister";
import AdminDashboard from "./pages/AdminDashboard";
import SessionLaunchPage from "./pages/SessionLaunchPage";
import WorkspaceManagerPage from "./pages/WorkspaceManagerPage";
import WorkspaceToolsPage from "./pages/WorkspaceToolsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/dashboard" element={<DashboardHome />} />
      <Route path="/sessions/new" element={<SessionLaunchPage />} />
      <Route path="/workspaces" element={<WorkspaceManagerPage />} />
      <Route path="/workspaces/new" element={<WorkspaceToolsPage />} />
      <Route path="/workspaces/:id/tools" element={<WorkspaceToolsPage />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/host/register" element={<HostRegister />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

