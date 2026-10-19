import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { FarmProvider } from "@/contexts/FarmContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import RequirePermission from "@/components/RequirePermission";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage, { readResetCode } from "@/pages/ResetPasswordPage";
import Dashboard from "@/pages/Dashboard";
import BatchesPage from "@/pages/BatchesPage";
import MortalityPage from "@/pages/MortalityPage";
import HarvestPage from "@/pages/HarvestPage";
import SalesPage from "@/pages/SalesPage";
import MoneyCollectionsPage from "@/pages/MoneyCollectionsPage";
import AdvancesPage from "@/pages/AdvancesPage";
import BuyersPage from "@/pages/BuyersPage";
import FeedPage from "@/pages/FeedPage";
import FeedSettingsPage from "@/pages/FeedSettingsPage";
import GrowthTrackingPage from "@/pages/GrowthTrackingPage";
import HealthPage from "@/pages/HealthPage";
import EnvironmentPage from "@/pages/EnvironmentPage";
import ExpensesPage from "@/pages/ExpensesPage";
import InventoryPage from "@/pages/InventoryPage";
import ReportsPage from "@/pages/ReportsPage";
import CostProfitPage from "@/pages/CostProfitPage";
import ReinvestmentCalculatorPage from "@/pages/ReinvestmentCalculatorPage";
import UserManagementPage from "@/pages/UserManagementPage";
import AccessDeniedPage from "@/pages/AccessDeniedPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthGate() {
  const { user, loading } = useAuth();
  const [resetCode, setResetCode] = useState(readResetCode);

  // A password-reset link must open the reset screen even if a stale session
  // exists, so it is handled before the authenticated routes.
  if (resetCode) return <ResetPasswordPage onDone={() => setResetCode("")} />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <PermissionsProvider>
      <FarmProvider>
        <AppLayout>
          <Routes>
            <Route path="/" element={<RequirePermission module="dashboard"><Dashboard /></RequirePermission>} />
            <Route path="/batches" element={<RequirePermission module="flocks"><BatchesPage /></RequirePermission>} />
            <Route path="/mortality" element={<RequirePermission module="mortality"><MortalityPage /></RequirePermission>} />
            <Route path="/harvest" element={<RequirePermission module="flocks"><HarvestPage /></RequirePermission>} />
            <Route path="/growth" element={<RequirePermission module="flocks"><GrowthTrackingPage /></RequirePermission>} />
            <Route path="/sales" element={<RequirePermission module="sales"><SalesPage /></RequirePermission>} />
            <Route path="/collections" element={<RequirePermission module="payments"><MoneyCollectionsPage /></RequirePermission>} />
            <Route path="/advances" element={<RequirePermission module="payments"><AdvancesPage /></RequirePermission>} />
            <Route path="/buyers" element={<RequirePermission module="customers"><BuyersPage /></RequirePermission>} />
            <Route path="/feed" element={<RequirePermission module="feeding"><FeedPage /></RequirePermission>} />
            <Route path="/feed-settings" element={<RequirePermission module="feeding" action="edit"><FeedSettingsPage /></RequirePermission>} />
            <Route path="/health" element={<RequirePermission module="health"><HealthPage /></RequirePermission>} />
            <Route path="/environment" element={<RequirePermission module="environment"><EnvironmentPage /></RequirePermission>} />
            <Route path="/expenses" element={<RequirePermission module="expenses"><ExpensesPage /></RequirePermission>} />
            <Route path="/cost-profit" element={<RequirePermission module="finance"><CostProfitPage /></RequirePermission>} />
            <Route path="/growth-calculator" element={<RequirePermission module="finance"><ReinvestmentCalculatorPage /></RequirePermission>} />
            <Route path="/inventory" element={<RequirePermission module="inventory"><InventoryPage /></RequirePermission>} />
            <Route path="/reports" element={<RequirePermission module="reports"><ReportsPage /></RequirePermission>} />
            <Route path="/users" element={<RequirePermission module="userManagement"><UserManagementPage /></RequirePermission>} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/access-denied" element={<AccessDeniedPage />} />
            {/* Signing in leaves the browser on /login; send authenticated users home. */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />

          </Routes>
        </AppLayout>
      </FarmProvider>
    </PermissionsProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <HashRouter>
          <AuthGate />
        </HashRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
