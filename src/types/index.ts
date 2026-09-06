export * from './database';

export type NavigationTab = 
  | 'dashboard'
  | 'machines'
  | 'machine-detail'
  | 'buildings'
  | 'locations'
  | 'tickets'
  | 'ticket-detail'
  | 'technicians'
  | 'technician-detail'
  | 'maintenance'
  | 'spare-parts'
  | 'inventory'
  | 'part-requests'
  | 'suppliers'
  | 'reports'
  | 'import-export'
  | 'import-history'
  | 'users'
  | 'audit-logs'
  | 'settings'
  | 'public-portal'
  | 'technician-portal';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}
