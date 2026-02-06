import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ServiceRequestProvider } from './context/ServiceRequestContext';
import { InventoryProvider } from './context/InventoryContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

import DashboardLayout from './components/DashboardLayout';
import RoomList from './pages/RoomList';
import RoomDetail from './pages/RoomDetail';
import ServiceRequests from './pages/ServiceRequests';
import LandingPage from './pages/LandingPage';
import Overview from './pages/Overview';
import LoginPage from './pages/LoginPage';
import UserProfile from './pages/UserProfile';
import UserManagement from './pages/admin/UserManagement';
import ReportPage from './pages/admin/ReportPage';
import OperationsPage from './pages/admin/OperationsPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <InventoryProvider>
          <ServiceRequestProvider>
            <Router>
              <Routes>
                <Route path="/login" element={<LoginPage />} />

                {/* Protected Root: Landing Page (Portal Selection) */}
                <Route path="/" element={
                  <ProtectedRoute>
                    <LandingPage />
                  </ProtectedRoute>
                } />

                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Overview />} />
                  <Route path="rooms" element={<RoomList />} />
                  <Route path="rooms/:roomId" element={<RoomDetail />} />
                  <Route path="service-requests" element={<ServiceRequests />} />
                  <Route path="profile" element={<UserProfile />} />
                  <Route path="admin/users" element={<UserManagement />} />
                  <Route path="reports" element={<ReportPage />} />
                  <Route path="operations" element={<OperationsPage />} />
                </Route>
              </Routes>
            </Router>
          </ServiceRequestProvider>
        </InventoryProvider>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
