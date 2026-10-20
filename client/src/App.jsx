import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/common/Toast";
import ProtectedRoute from "./components/common/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ReportEmergency from "./pages/ReportEmergency";
import TrackIncident from "./pages/TrackIncident";
import Incidents from "./pages/Incidents";
import IncidentDetails from "./pages/IncidentDetails";
import Resources from "./pages/Resources";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import Responder from "./pages/Responder";
import Admin from "./pages/Admin";

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/track" element={<TrackIncident />} />

            {/* Citizen */}
            <Route path="/report" element={
              <ProtectedRoute roles={["citizen", "operator", "admin", "responder", "hospital"]}>
                <ReportEmergency />
              </ProtectedRoute>
            } />

            {/* Operator / Admin */}
            <Route path="/dashboard" element={
              <ProtectedRoute roles={["operator", "admin", "hospital"]}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/incidents" element={
              <ProtectedRoute roles={["operator", "admin", "responder"]}>
                <Incidents />
              </ProtectedRoute>
            } />
            <Route path="/incidents/:id" element={
              <ProtectedRoute roles={["operator", "admin", "responder", "citizen"]}>
                <IncidentDetails />
              </ProtectedRoute>
            } />
            <Route path="/resources" element={
              <ProtectedRoute roles={["operator", "admin", "responder", "hospital"]}>
                <Resources />
              </ProtectedRoute>
            } />
            <Route path="/alerts" element={
              <ProtectedRoute roles={["operator", "admin"]}>
                <Alerts />
              </ProtectedRoute>
            } />
            <Route path="/analytics" element={
              <ProtectedRoute roles={["operator", "admin", "responder"]}>
                <Analytics />
              </ProtectedRoute>
            } />

            {/* Responder */}
            <Route path="/responder" element={
              <ProtectedRoute roles={["responder", "operator", "admin"]}>
                <Responder />
              </ProtectedRoute>
            } />

            {/* Admin */}
            <Route path="/admin" element={
              <ProtectedRoute roles={["admin"]}>
                <Admin />
              </ProtectedRoute>
            } />

            {/* Default redirects */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
