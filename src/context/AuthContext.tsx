import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole, NavigationTab } from '../types';
import { api } from '../services/api';

export interface DemoAccount {
  role: UserRole;
  email: string;
  name: string;
  nameAr: string;
  title: string;
  titleAr: string;
  badgeColor: string;
}

// Deprecated empty demo accounts (ensures pure company isolation and no mock accounts)
export const DEMO_ACCOUNTS: DemoAccount[] = [];

export interface RolePermissions {
  canAccessTab: (tab: NavigationTab) => boolean;
  isAdmin: boolean;
  canEditMachines: boolean;
  canManageFleet: boolean;
  canAssignTickets: boolean;
  canManageTickets: boolean;
  canCreateTicket: boolean;
  canDeleteTicket: boolean;
  canArchiveTicket: boolean;
  canCloseTicket: boolean;
  canManageTechnicians: boolean;
  canManageInventory: boolean;
  canIssueParts: boolean;
  canViewAudit: boolean;
  canAdminUsers: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canImportData: boolean;
  canDeleteRecord: boolean;
  canCommitBaseline: boolean;
  canPurgeDatabase: boolean;
  isReadOnly: boolean;
}

interface AuthContextType extends RolePermissions {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialSetupRequired: boolean;
  companyName: string;
  accessToken: string | null;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  registerInitialAdmin: (data: {
    companyName: string;
    fullName: string;
    email: string;
    phone?: string;
    password?: string;
    city?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  loginAsDemo: (demoAccount: DemoAccount) => void;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
  refreshAuthStatus: () => Promise<void>;
  resetAllUsers: () => Promise<void>;
  getRoleBadgeInfo: (role?: UserRole) => { titleAr: string; titleEn: string; color: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem('vending_fleet_access_token');
  });
  const [isInitialSetupRequired, setIsInitialSetupRequired] = useState<boolean>(false);
  const [companyName, setCompanyName] = useState<string>(() => {
    return localStorage.getItem('vending_fleet_company_name') || '';
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshAuthStatus = async () => {
    try {
      const status = await api.getAuthStatus();
      if (status.companyName) {
        setCompanyName(status.companyName);
        localStorage.setItem('vending_fleet_company_name', status.companyName);
      }
      if (!status.hasUsers) {
        setIsInitialSetupRequired(true);
        setUser(null);
        setAccessToken(null);
        localStorage.removeItem('vending_fleet_user');
        localStorage.removeItem('vending_fleet_access_token');
      } else {
        setIsInitialSetupRequired(false);
      }
    } catch (err) {
      console.warn('Could not refresh auth status:', err);
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        const status = await api.getAuthStatus();
        if (status.companyName) {
          setCompanyName(status.companyName);
          localStorage.setItem('vending_fleet_company_name', status.companyName);
        }

        if (!status.hasUsers) {
          // Pure Clean Slate: No registered users exist yet. Must run initial System Admin onboarding!
          setIsInitialSetupRequired(true);
          setUser(null);
          setAccessToken(null);
          localStorage.removeItem('vending_fleet_user');
          localStorage.removeItem('vending_fleet_access_token');
        } else {
          setIsInitialSetupRequired(false);
          const savedUser = localStorage.getItem('vending_fleet_user');
          if (savedUser) {
            try {
              const parsed = JSON.parse(savedUser);
              // Verify saved user still exists in current registered users
              const allUsers = await api.getUsers();
              const found = allUsers.find((u: User) => u.id === parsed.id || u.email?.toLowerCase() === parsed.email?.toLowerCase());
              if (found && found.isActive) {
                setUser(found);
              } else if (allUsers.length > 0) {
                // If saved user is invalid or deleted, log out
                setUser(null);
                localStorage.removeItem('vending_fleet_user');
              }
            } catch {
              setUser(null);
              localStorage.removeItem('vending_fleet_user');
            }
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const registerInitialAdmin = async (data: {
    companyName: string;
    fullName: string;
    email: string;
    phone?: string;
    password?: string;
    city?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const res = await api.registerInitialAdmin(data);
      if (res && res.success && res.user) {
        setUser(res.user);
        const token = res.token || `jwt-admin-${Date.now()}`;
        setAccessToken(token);
        if (data.companyName) {
          setCompanyName(data.companyName);
          localStorage.setItem('vending_fleet_company_name', data.companyName);
        }
        setIsInitialSetupRequired(false);
        localStorage.setItem('vending_fleet_user', JSON.stringify(res.user));
        localStorage.setItem('vending_fleet_access_token', token);
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
        return { success: true };
      }
      return { success: false, error: res?.error || 'فشل في تسجيل مدير النظام' };
    } catch (err: any) {
      console.error('Register admin error:', err);
      return { success: false, error: err.message || 'حدث خطأ أثناء تسجيل مدير النظام' };
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const res = await api.login(email, password);
      if (res && res.success && res.user) {
        setUser(res.user);
        const token = res.token || `jwt-${res.user.id}-${Date.now()}`;
        setAccessToken(token);
        if (res.companyName) {
          setCompanyName(res.companyName);
          localStorage.setItem('vending_fleet_company_name', res.companyName);
        }
        localStorage.setItem('vending_fleet_user', JSON.stringify(res.user));
        localStorage.setItem('vending_fleet_access_token', token);
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
        return { success: true };
      }
      return { success: false, error: res?.error || 'فشل تسجيل الدخول' };
    } catch (error: any) {
      console.error('Login error:', error);
      return { success: false, error: error.message || 'بيانات الدخول غير صحيحة أو المستخدم غير مسجل' };
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsDemo = (_demo: DemoAccount) => {
    // Deprecated for mock demo accounts
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('vending_fleet_user');
    localStorage.removeItem('vending_fleet_access_token');
  };

  const resetAllUsers = async () => {
    setIsLoading(true);
    try {
      await api.resetUsers();
      setUser(null);
      setAccessToken(null);
      setIsInitialSetupRequired(true);
      localStorage.removeItem('vending_fleet_user');
      localStorage.removeItem('vending_fleet_access_token');
      window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
    } catch (err) {
      console.error('Failed to reset users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const hasRole = (roles: UserRole[]): boolean => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    return roles.includes(user.role);
  };

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const canEditMachines = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']);
  const canManageFleet = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'FACILITY_MANAGER', 'MANAGEMENT']);
  const canAssignTickets = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']);
  const canManageTickets = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'TECHNICIAN']);
  const isReadOnly = user?.role === 'VIEWER' || user?.role === 'MANAGEMENT';
  const canCreateTicket = !isReadOnly && hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'FACILITY_MANAGER', 'TECHNICIAN']);
  const canDeleteTicket = hasRole(['SUPER_ADMIN', 'ADMIN']);
  const canArchiveTicket = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']);
  const canCloseTicket = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']);
  const canManageTechnicians = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']);
  const canManageInventory = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_OFFICER']);
  const canIssueParts = hasRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_OFFICER']);
  const canViewAudit = hasRole(['SUPER_ADMIN', 'ADMIN', 'VIEWER']);
  const canAdminUsers = user?.role === 'SUPER_ADMIN';
  const canManageUsers = hasRole(['SUPER_ADMIN', 'ADMIN']);
  const canManageSettings = hasRole(['SUPER_ADMIN', 'ADMIN']);
  const canImportData = hasRole(['SUPER_ADMIN', 'ADMIN']);
  const canDeleteRecord = hasRole(['SUPER_ADMIN', 'ADMIN']);
  const canCommitBaseline = user?.role === 'SUPER_ADMIN';
  const canPurgeDatabase = user?.role === 'SUPER_ADMIN';

  const canAccessTab = (tab: NavigationTab): boolean => {
    if (tab === 'public-portal') return true;
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;

    switch (tab) {
      case 'dashboard':
      case 'machines':
      case 'machine-detail':
      case 'buildings':
      case 'locations':
        return true;

      case 'tickets':
      case 'ticket-detail':
        return true;

      case 'technicians':
      case 'technician-detail':
        return hasRole(['MAINTENANCE_MANAGER']);

      case 'maintenance':
        return hasRole(['MAINTENANCE_MANAGER', 'TECHNICIAN', 'MANAGEMENT']);

      case 'spare-parts':
        return hasRole(['MAINTENANCE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_OFFICER', 'TECHNICIAN']);

      case 'inventory':
        return hasRole(['MAINTENANCE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_OFFICER']);

      case 'part-requests':
        return hasRole(['MAINTENANCE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_OFFICER', 'TECHNICIAN']);

      case 'suppliers':
        return hasRole(['MAINTENANCE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_OFFICER']);

      case 'reports':
        return hasRole(['MAINTENANCE_MANAGER', 'MANAGEMENT', 'FACILITY_MANAGER', 'VIEWER']);

      case 'import-export':
      case 'import-history':
      case 'users':
      case 'settings':
        return false; // Strictly restricted to SUPER_ADMIN / ADMIN

      case 'audit-logs':
        return hasRole(['VIEWER']);

      default:
        return false;
    }
  };

  const getRoleBadgeInfo = (role?: UserRole) => {
    const r = role || user?.role || 'VIEWER';
    switch (r) {
      case 'SUPER_ADMIN':
        return { titleAr: 'مدير عام النظام', titleEn: 'Super Administrator', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
      case 'ADMIN':
        return { titleAr: 'مدير النظام', titleEn: 'System Administrator', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' };
      case 'MAINTENANCE_MANAGER':
        return { titleAr: 'مدير عمليات الصيانة', titleEn: 'Maintenance Manager', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      case 'TECHNICIAN':
        return { titleAr: 'فني صيانة ميداني', titleEn: 'Field Technician', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
      case 'WAREHOUSE_OFFICER':
      case 'WAREHOUSE':
        return { titleAr: 'مسؤول المستودع وقطع الغيار', titleEn: 'Warehouse Custodian', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
      case 'FACILITY_MANAGER':
        return { titleAr: 'مشرف الموقع والمرافق', titleEn: 'Facility Manager', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' };
      case 'MANAGEMENT':
        return { titleAr: 'إدارة العمليات والتخطيط', titleEn: 'Operations Management', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
      case 'VIEWER':
      default:
        return { titleAr: 'مراقب جودة وتدقيق (قراءة فقط)', titleEn: 'Compliance Auditor (Read-Only)', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      isInitialSetupRequired,
      companyName,
      accessToken,
      login,
      registerInitialAdmin,
      loginAsDemo,
      logout,
      hasRole,
      isAdmin,
      canEditMachines,
      canManageFleet,
      canAssignTickets,
      canManageTickets,
      canCreateTicket,
      canDeleteTicket,
      canArchiveTicket,
      canCloseTicket,
      canManageTechnicians,
      canManageInventory,
      canIssueParts,
      canViewAudit,
      canAdminUsers,
      canManageUsers,
      canManageSettings,
      canImportData,
      canDeleteRecord,
      canCommitBaseline,
      canPurgeDatabase,
      isReadOnly,
      canAccessTab,
      getRoleBadgeInfo,
      refreshAuthStatus,
      resetAllUsers
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
