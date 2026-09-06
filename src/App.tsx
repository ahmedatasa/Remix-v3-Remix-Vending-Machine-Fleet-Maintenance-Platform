import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { NavigationTab } from './types';

// Views
import { LoginView } from './components/views/LoginView';
import { DashboardView } from './components/views/DashboardView';
import { MachinesView } from './components/views/MachinesView';
import { MachineDetailView } from './components/views/MachineDetailView';
import { BuildingsView } from './components/views/BuildingsView';
import { LocationsView } from './components/views/LocationsView';
import { TicketsView } from './components/views/TicketsView';
import { TicketDetailView } from './components/views/TicketDetailView';
import { TechniciansView } from './components/views/TechniciansView';
import { TechnicianDetailView } from './components/views/TechnicianDetailView';
import { MaintenanceView } from './components/views/MaintenanceView';
import { SparePartsView } from './components/views/SparePartsView';
import { InventoryView } from './components/views/InventoryView';
import { PartRequestsView } from './components/views/PartRequestsView';
import { SuppliersView } from './components/views/SuppliersView';
import { ReportsView } from './components/views/ReportsView';
import { ImportExportView } from './components/views/ImportExportView';
import { ImportHistoryView } from './components/views/ImportHistoryView';
import { UsersView } from './components/views/UsersView';
import { SettingsView } from './components/views/SettingsView';
import { AuditLogsView } from './components/views/AuditLogsView';
import { PublicTicketPortal } from './components/views/PublicTicketPortal';
import { PublicCustomerPortal } from './components/views/PublicCustomerPortal';
import { TechnicianMobilePortal } from './components/views/TechnicianMobilePortal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AccessDeniedView } from './components/common/AccessDeniedView';

const getInitialRoute = (): { tab: NavigationTab; id?: string } => {
  if (typeof window !== 'undefined') {
    try {
      const search = window.location.search;
      const params = new URLSearchParams(search);
      let machineParam = params.get('machineId') || params.get('machine') || params.get('qr') || params.get('id') || params.get('token');
      const pathname = window.location.pathname;
      const hash = window.location.hash;

      if (!machineParam && hash.includes('?')) {
        const hashParams = new URLSearchParams(hash.split('?')[1] || '');
        machineParam = hashParams.get('machineId') || hashParams.get('machine') || hashParams.get('qr') || hashParams.get('id') || hashParams.get('token');
      }

      // Check for Technician Portal Route
      if (pathname.includes('/technician') || hash.includes('/technician') || params.get('mode') === 'technician') {
        return { tab: 'technician-portal', id: undefined };
      }

      // Check for Public QR Portal Route: /public/m/:token
      if (pathname.includes('/public/m/')) {
        const token = pathname.split('/public/m/')[1]?.split('/')[0]?.split('?')[0];
        return { tab: 'public-portal', id: token ? decodeURIComponent(token).trim() : undefined };
      }

      // Check for Public Ticket Tracking Route: /public/ticket/:trackingToken
      if (pathname.includes('/public/ticket/')) {
        const trackingToken = pathname.split('/public/ticket/')[1]?.split('/')[0]?.split('?')[0];
        return { tab: 'public-portal', id: trackingToken ? decodeURIComponent(trackingToken).trim() : undefined };
      }

      if (pathname.includes('report-fault') || pathname.includes('public-portal') || hash.includes('public-portal') || hash.includes('report-fault') || machineParam) {
        return {
          tab: 'public-portal',
          id: machineParam ? decodeURIComponent(machineParam).trim() : undefined
        };
      }
    } catch {
      // Fallback
    }
  }
  return { tab: 'dashboard', id: undefined };
};

const AppContent: React.FC = () => {
  const { isAuthenticated, user, canAccessTab } = useAuth();
  const initialRoute = useRef(getInitialRoute()).current;
  const [activeTab, setActiveTab] = useState<NavigationTab>(initialRoute.tab);
  const [activeDetailId, setActiveDetailId] = useState<string | undefined>(initialRoute.id);

  useEffect(() => {
    const route = getInitialRoute();
    if (route.tab === 'public-portal' || route.tab === 'technician-portal') {
      setActiveTab(route.tab);
      if (route.id) setActiveDetailId(route.id);
    }
  }, []);

  const handleNavigate = (tab: NavigationTab, id?: string) => {
    setActiveTab(tab);
    setActiveDetailId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If public customer reporting portal is explicitly accessed
  if (activeTab === 'public-portal') {
    return (
      <ErrorBoundary fallbackTitle="Portal Error" onReset={() => handleNavigate('dashboard')}>
        <PublicCustomerPortal
          initialToken={activeDetailId}
          initialTrackingToken={activeDetailId?.startsWith('TRK-') || activeDetailId?.startsWith('TCK-') ? activeDetailId : undefined}
          onNavigateToAdmin={() => handleNavigate('dashboard')}
        />
      </ErrorBoundary>
    );
  }

  // If mobile technician portal is accessed
  if (activeTab === 'technician-portal') {
    return (
      <ErrorBoundary fallbackTitle="Technician Portal Error" onReset={() => handleNavigate('dashboard')}>
        <TechnicianMobilePortal onBackToApp={() => handleNavigate('dashboard')} />
      </ErrorBoundary>
    );
  }

  // If not authenticated, render Login Screen
  if (!isAuthenticated) {
    return <LoginView onNavigate={handleNavigate} />;
  }

  const isTabAllowed = canAccessTab(activeTab);

  // Render within Enterprise Layout Shell
  return (
    <Layout
      activeTab={activeTab}
      onNavigate={handleNavigate}
    >
      <ErrorBoundary fallbackTitle="View Error" onReset={() => handleNavigate('dashboard')}>
        {!isTabAllowed ? (
          <AccessDeniedView requestedTab={activeTab} onNavigate={handleNavigate} />
        ) : (
          <>
            {activeTab === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
            {activeTab === 'machines' && <MachinesView onNavigate={handleNavigate} />}
            {activeTab === 'machine-detail' && (
              <MachineDetailView machineId={activeDetailId || ''} onNavigate={handleNavigate} />
            )}
            {activeTab === 'buildings' && <BuildingsView onNavigate={handleNavigate} />}
            {activeTab === 'locations' && <LocationsView onNavigate={handleNavigate} />}
            {activeTab === 'tickets' && <TicketsView onNavigate={handleNavigate} initialAction={activeDetailId} />}
            {activeTab === 'ticket-detail' && (
              <TicketDetailView ticketId={activeDetailId || ''} onNavigate={handleNavigate} />
            )}
            {activeTab === 'technicians' && <TechniciansView onNavigate={handleNavigate} />}
            {activeTab === 'technician-detail' && (
              <TechnicianDetailView technicianId={activeDetailId || ''} onNavigate={handleNavigate} />
            )}
            {activeTab === 'maintenance' && <MaintenanceView onNavigate={handleNavigate} />}
            {activeTab === 'spare-parts' && <SparePartsView onNavigate={handleNavigate} />}
            {activeTab === 'inventory' && <InventoryView onNavigate={handleNavigate} />}
            {activeTab === 'part-requests' && <PartRequestsView onNavigate={handleNavigate} />}
            {activeTab === 'suppliers' && <SuppliersView onNavigate={handleNavigate} />}
            {activeTab === 'reports' && <ReportsView onNavigate={handleNavigate} />}
            {activeTab === 'import-export' && <ImportExportView onNavigate={handleNavigate} />}
            {activeTab === 'import-history' && <ImportHistoryView onNavigate={handleNavigate} />}
            {activeTab === 'users' && <UsersView onNavigate={handleNavigate} />}
            {activeTab === 'settings' && <SettingsView />}
            {activeTab === 'audit-logs' && <AuditLogsView onNavigate={handleNavigate} />}
          </>
        )}
      </ErrorBoundary>
    </Layout>
  );
};

export function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <NotificationProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default App;
