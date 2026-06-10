import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ServiceRequestProvider } from './context/ServiceRequestContext';
import { InventoryProvider } from './context/InventoryContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PortalProvider } from './context/PortalContext';
import { NotificationProvider } from './context/NotificationContext';
import { AccessMatrixProvider, useAccessMatrix } from './context/AccessMatrixContext';
import { AssetAccountingProvider } from './context/AssetAccountingContext';
import type { FeatureKey } from './context/AccessMatrixContext';

import DashboardLayout from './layouts/DashboardLayout';
import AdminLayout from './layouts/AdminLayout';
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
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import SystemLogsPage from './pages/admin/SystemLogsPage';
import ItemManagementPage from './pages/admin/ItemManagementPage';
import AssetAccountingPage from './pages/admin/AssetAccountingPage';
import PreventiveMaintenancePage from './pages/admin/PreventiveMaintenancePage';
import DisposalPage from './pages/admin/DisposalPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const HomeRoute = () => {
  const { isAuthenticated, user } = useAuth();
  const { canSee, loading } = useAccessMatrix();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return null;
  }

  // Matrix-driven portal decision: users who can access admin-only features go to admin portal
  const hasAdminPortalAccess = canSee('user_management', user.role) || canSee('system_logs', user.role);
  if (hasAdminPortalAccess) {
    return <Navigate to="/admin" replace />;
  }

  return <LandingPage />;
};

const InventoryRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { canSee, loading } = useAccessMatrix();

  if (loading || !user) {
    return null;
  }

  // Matrix-driven: if the user has access to admin-only features per the matrix, they belong in the admin portal
  const hasAdminPortalAccess = canSee('user_management', user.role) || canSee('system_logs', user.role);
  if (hasAdminPortalAccess) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  const { canSee, loading } = useAccessMatrix();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return null;
  }

  // Matrix-driven: only users who can see admin-only features (per current matrix) are allowed in the admin portal
  const hasAdminPortalAccess = canSee('user_management', user.role) || canSee('system_logs', user.role);
  if (!hasAdminPortalAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const FeatureRoute = ({
  feature,
  requireEdit = false,
  children,
}: {
  feature: FeatureKey;
  requireEdit?: boolean;
  children: React.ReactNode;
}) => {
  const { isAuthenticated, user } = useAuth();
  const { canSee, canEditFeature, loading } = useAccessMatrix();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return null;
  }

  const isAllowed = requireEdit
    ? canEditFeature(feature, user.role)
    : canSee(feature, user.role);

  if (!isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const App = () => {
  return (
    <AuthProvider>
      <AccessMatrixProvider>
        <PortalProvider>
          <ToastProvider>
            <NotificationProvider>
              <InventoryProvider>
                <ServiceRequestProvider>
                  <AssetAccountingProvider>
                    <Router>
                    <Routes>
                      <Route path="/login" element={<LoginPage />} />

                      {/* Protected Root: Landing Page (Portal Selection) */}
                      <Route path="/" element={
                        <ProtectedRoute>
                          <HomeRoute />
                        </ProtectedRoute>
                      } />

                      <Route path="/dashboard" element={
                        <ProtectedRoute>
                          <InventoryRoute>
                            <FeatureRoute feature="dashboard">
                              <DashboardLayout />
                            </FeatureRoute>
                          </InventoryRoute>
                        </ProtectedRoute>
                      }>
                        <Route index element={<InventoryRoute><FeatureRoute feature="dashboard"><Overview /></FeatureRoute></InventoryRoute>} />
                        <Route path="rooms" element={<InventoryRoute><FeatureRoute feature="rooms"><RoomList /></FeatureRoute></InventoryRoute>} />
                        <Route path="rooms/:roomId" element={<InventoryRoute><FeatureRoute feature="rooms"><RoomDetail /></FeatureRoute></InventoryRoute>} />
                        <Route path="service-requests" element={<InventoryRoute><FeatureRoute feature="service_requests"><ServiceRequests /></FeatureRoute></InventoryRoute>} />
                        <Route path="profile" element={<UserProfile />} />
                        <Route path="admin/users" element={<InventoryRoute><FeatureRoute feature="user_management"><UserManagement /></FeatureRoute></InventoryRoute>} />
                        <Route path="reports" element={<InventoryRoute><FeatureRoute feature="reports"><ReportPage /></FeatureRoute></InventoryRoute>} />
                        <Route path="print-assets" element={<InventoryRoute><FeatureRoute feature="item_management"><Navigate to="/dashboard/items?tab=label" replace /></FeatureRoute></InventoryRoute>} />
                        <Route path="inventory-codes" element={<InventoryRoute><FeatureRoute feature="item_management"><Navigate to="/dashboard/items?tab=codes" replace /></FeatureRoute></InventoryRoute>} />
                        <Route path="items" element={<InventoryRoute><FeatureRoute feature="item_management"><ItemManagementPage /></FeatureRoute></InventoryRoute>} />
                        <Route path="operations" element={<InventoryRoute><FeatureRoute feature="operations"><OperationsPage /></FeatureRoute></InventoryRoute>} />
                        <Route path="assets" element={<InventoryRoute><FeatureRoute feature="asset_accounting"><AssetAccountingPage /></FeatureRoute></InventoryRoute>} />
                        <Route path="preventive-maintenance" element={<InventoryRoute><FeatureRoute feature="preventive_maintenance"><PreventiveMaintenancePage /></FeatureRoute></InventoryRoute>} />
                        <Route path="disposal" element={<InventoryRoute><FeatureRoute feature="disposal"><DisposalPage /></FeatureRoute></InventoryRoute>} />
                      </Route>

                      <Route path="/admin" element={
                        <AdminRoute>
                          <FeatureRoute feature="dashboard">
                            <AdminLayout />
                          </FeatureRoute>
                        </AdminRoute>
                      }>
                        <Route index element={<FeatureRoute feature="dashboard"><AdminDashboardPage /></FeatureRoute>} />
                        <Route path="users" element={<FeatureRoute feature="user_management"><UserManagement /></FeatureRoute>} />
                        <Route path="system-logs" element={<FeatureRoute feature="system_logs"><SystemLogsPage /></FeatureRoute>} />
                        <Route path="profile" element={<UserProfile />} />
                      </Route>
                    </Routes>
                  </Router>
                  </AssetAccountingProvider>
                </ServiceRequestProvider>
              </InventoryProvider>
            </NotificationProvider>
          </ToastProvider>
        </PortalProvider>
      </AccessMatrixProvider>
    </AuthProvider>
  );
};

export default App;
