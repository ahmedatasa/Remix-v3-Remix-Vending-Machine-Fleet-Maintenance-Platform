import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  ShieldCheck,
  Mail,
  UserCheck,
  Lock,
  KeyRound,
  CheckCircle2,
  Trash2,
  Edit2,
  Phone,
  Power,
  Search,
  Filter,
  UserX,
  Shield,
  Building,
  AlertTriangle
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { User, UserRole, NavigationTab } from '../../types';
import { api } from '../../services/api';

interface UsersViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const UsersView: React.FC<UsersViewProps> = ({ onNavigate }) => {
  const { t, formatDate, isRTL } = useLanguage();
  const { showToast } = useNotification();
  const { user: currentUser, canAdminUsers, isAdmin, canManageUsers } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Add User Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('TECHNICIAN');
  const [password, setPassword] = useState('password123');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit User Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('TECHNICIAN');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editPassword, setEditPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete User Modal State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const data = await api.getUsers();
      setUsers(data);
    } catch {
      showToast(t('error'), 'Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();

    const handleUpdate = () => {
      loadUsers();
    };

    window.addEventListener('vending-fleet-data-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('vending-fleet-data-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await api.createUser({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role,
        password,
        isActive: true
      });

      showToast(t('success'), `User account created for ${created.fullName}`, 'success');
      setIsAddOpen(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('password123');
      await loadUsers();
    } catch {
      showToast(t('error'), 'Failed to create user', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditFullName(user.fullName || (user as any).name || '');
    setEditEmail(user.email || '');
    setEditPhone(user.phone || '');
    setEditRole(user.role);
    setEditIsActive(user.isActive !== false);
    setEditPassword('');
    setIsEditOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editFullName.trim() || !editEmail.trim()) return;

    setIsUpdating(true);
    try {
      const updates: Partial<User> = {
        fullName: editFullName.trim(),
        name: editFullName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim() || undefined,
        role: editRole,
        isActive: editIsActive
      };

      if (editPassword.trim()) {
        updates.password = editPassword.trim();
      }

      await api.updateUser(editingUser.id, updates);

      showToast(t('success'), `User account for ${editFullName} updated successfully`, 'success');
      setIsEditOpen(false);
      setEditingUser(null);
      await loadUsers();
    } catch {
      showToast(t('error'), 'Failed to update user account', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenDelete = (user: User) => {
    if (currentUser?.id === user.id) {
      showToast('Action Restricted', 'You cannot delete your own active administrator account', 'warning');
      return;
    }
    setUserToDelete(user);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async (reason: string) => {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteUser(userToDelete.id, reason);
      showToast(t('success'), `User ${userToDelete.fullName} has been removed`, 'success');
      setIsDeleteOpen(false);
      setUserToDelete(null);
      await loadUsers();
    } catch {
      showToast(t('error'), 'Failed to delete user account', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    if (currentUser?.id === user.id && user.isActive) {
      showToast('Action Restricted', 'You cannot deactivate your own active session account', 'warning');
      return;
    }

    try {
      const newStatus = !user.isActive;
      await api.updateUser(user.id, { isActive: newStatus });
      showToast(
        t('success'),
        `User ${user.fullName} is now ${newStatus ? 'Activated' : 'Deactivated'}`,
        'success'
      );
      await loadUsers();
    } catch {
      showToast(t('error'), 'Failed to change user active status', 'error');
    }
  };

  // Filtered list
  const filteredUsers = users.filter(user => {
    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && user.isActive !== false) ||
      (statusFilter === 'DISABLED' && user.isActive === false);
    return matchesRole && matchesStatus;
  });

  // Role pill styles
  const getRoleBadge = (roleName: UserRole) => {
    switch (roleName) {
      case 'SUPER_ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Shield className="w-3 h-3 text-purple-400" />
            SUPER ADMIN
          </span>
        );
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <ShieldCheck className="w-3 h-3 text-blue-400" />
            ADMIN
          </span>
        );
      case 'MAINTENANCE_MANAGER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <UserCheck className="w-3 h-3 text-amber-400" />
            MANAGER
          </span>
        );
      case 'TECHNICIAN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            TECHNICIAN
          </span>
        );
      case 'WAREHOUSE_OFFICER':
      case 'WAREHOUSE' as any:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            WAREHOUSE
          </span>
        );
      case 'FACILITY_MANAGER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Building className="w-3 h-3 text-indigo-400" />
            FACILITY
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-500/15 text-slate-300 border border-slate-500/30">
            {roleName}
          </span>
        );
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'fullName',
      header: t('userName'),
      sortable: true,
      render: row => {
        const isCurrent = currentUser?.id === row.id;
        const initial = (row.fullName || (row as any).name || 'U').charAt(0).toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md shadow-blue-500/10 flex-shrink-0">
              {initial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-xs">
                  {row.fullName || (row as any).name}
                </span>
                {isCurrent && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    You
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3 text-slate-500" />
                  {row.email}
                </span>
                {row.phone && (
                  <span className="flex items-center gap-1 border-l border-slate-800 pl-2">
                    <Phone className="w-3 h-3 text-slate-500" />
                    {row.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'role',
      header: t('role'),
      sortable: true,
      render: row => getRoleBadge(row.role)
    },
    {
      key: 'isActive',
      header: t('status'),
      sortable: true,
      render: row => {
        const active = row.isActive !== false;
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border font-mono ${
              active
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {active ? 'Active' : 'Disabled'}
          </span>
        );
      }
    },
    {
      key: 'createdAt',
      header: 'Created On',
      sortable: true,
      render: row => (
        <span className="text-xs text-slate-400 font-mono">
          {formatDate(row.createdAt || (row as any).updatedAt)}
        </span>
      )
    },
    {
      key: 'id',
      header: 'Actions',
      render: row => {
        const isSelf = currentUser?.id === row.id;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => handleOpenEdit(row)}
              title="Edit User Account"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-600/20 text-slate-300 hover:text-blue-300 border border-slate-700/60 hover:border-blue-500/40 transition-all duration-150"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => handleToggleActive(row)}
              title={row.isActive ? 'Deactivate User' : 'Activate User'}
              className={`p-1.5 rounded-lg border transition-all duration-150 ${
                row.isActive
                  ? 'bg-slate-800 hover:bg-amber-600/20 text-slate-300 hover:text-amber-300 border-slate-700/60 hover:border-amber-500/40'
                  : 'bg-slate-800 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-300 border-slate-700/60 hover:border-emerald-500/40'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => handleOpenDelete(row)}
              disabled={isSelf}
              title={isSelf ? 'Cannot delete current account' : 'Delete User Account'}
              className={`p-1.5 rounded-lg border transition-all duration-150 ${
                isSelf
                  ? 'opacity-30 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-600'
                  : 'bg-slate-800 hover:bg-rose-600/20 text-slate-300 hover:text-rose-300 border-slate-700/60 hover:border-rose-500/40'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      }
    }
  ];

  // Quick stats
  const totalCount = users.length;
  const activeCount = users.filter(u => u.isActive !== false).length;
  const adminCount = users.filter(u => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN' || u.role === 'MAINTENANCE_MANAGER').length;
  const technicianCount = users.filter(u => u.role === 'TECHNICIAN').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-100">{t('users')} & Role-Based Access</h2>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
              RBAC
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Enterprise RBAC governance: Super Admins, Maintenance Managers, Field Technicians, Warehouse Officers, and Viewers
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={() => setIsAddOpen(true)}
        >
          Create User Account
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Total Accounts</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-1">{totalCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Active Operators</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Admins & Managers</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 mt-1">{adminCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Field Technicians</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{technicianCount}</div>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Role:
            </span>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admins</option>
              <option value="ADMIN">Admins</option>
              <option value="MAINTENANCE_MANAGER">Maintenance Managers</option>
              <option value="TECHNICIAN">Technicians</option>
              <option value="WAREHOUSE_OFFICER">Warehouse Officers</option>
              <option value="FACILITY_MANAGER">Facility Managers</option>
              <option value="VIEWER">Viewers</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="DISABLED">Disabled Only</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing <strong className="text-slate-200">{filteredUsers.length}</strong> of {users.length} users
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={filteredUsers}
        isLoading={isLoading}
        searchPlaceholder={t('searchUsers')}
      />

      {/* Add User Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Provision User Account"
        subtitle="Grant role-based credentials and permissions to platform members"
        maxWidth="md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Tariq Al-Mansoor"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Corporate Email Address *
              </label>
              <input
                type="email"
                required
                placeholder="tariq@vendingfleet.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                placeholder="+966 50 123 4567"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Enterprise Role *
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as UserRole)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="SUPER_ADMIN">SUPER_ADMIN (Full Platform Governance)</option>
                <option value="ADMIN">ADMIN (System Administrator)</option>
                <option value="MAINTENANCE_MANAGER">MAINTENANCE_MANAGER (Dispatch & Approvals)</option>
                <option value="TECHNICIAN">TECHNICIAN (Field Work & Parts Request)</option>
                <option value="WAREHOUSE_OFFICER">WAREHOUSE_OFFICER (Inventory & Orders)</option>
                <option value="FACILITY_MANAGER">FACILITY_MANAGER (Campus Locations)</option>
                <option value="VIEWER">VIEWER (Read-Only Auditing)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Initial Password *
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-800/40 text-[11px] text-blue-300/90 leading-relaxed">
            New accounts receive instant access with their provisioned credentials. Password can be rotated anytime by administrators.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              Create User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit User Account"
        subtitle={editingUser ? `Updating account settings for ${editingUser.fullName}` : 'Edit User'}
        maxWidth="md"
      >
        <form onSubmit={handleUpdateUser} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={editFullName}
              onChange={e => setEditFullName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Corporate Email Address *
              </label>
              <input
                type="email"
                required
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="+966 50 123 4567"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Enterprise Role *
              </label>
              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value as UserRole)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="SUPER_ADMIN">SUPER_ADMIN (Full Platform Governance)</option>
                <option value="ADMIN">ADMIN (System Administrator)</option>
                <option value="MAINTENANCE_MANAGER">MAINTENANCE_MANAGER (Dispatch & Approvals)</option>
                <option value="TECHNICIAN">TECHNICIAN (Field Work & Parts Request)</option>
                <option value="WAREHOUSE_OFFICER">WAREHOUSE_OFFICER (Inventory & Orders)</option>
                <option value="FACILITY_MANAGER">FACILITY_MANAGER (Campus Locations)</option>
                <option value="VIEWER">VIEWER (Read-Only Auditing)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Account Status
              </label>
              <select
                value={editIsActive ? 'active' : 'disabled'}
                onChange={e => setEditIsActive(e.target.value === 'active')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="active">Active (Access Granted)</option>
                <option value="disabled">Disabled (Access Revoked)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Reset Password <span className="text-slate-500 font-normal">(Leave blank to keep existing password)</span>
            </label>
            <input
              type="password"
              placeholder="Enter new password if changing..."
              value={editPassword}
              onChange={e => setEditPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isUpdating}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete User Modal */}
      {userToDelete && (
        <ConfirmActionModal
          isOpen={isDeleteOpen}
          onClose={() => {
            setIsDeleteOpen(false);
            setUserToDelete(null);
          }}
          onConfirm={handleConfirmDelete}
          title="Delete User Account"
          entityName={userToDelete.fullName || userToDelete.email}
          entityType="User Account"
          actionType="DELETE"
          canHardDelete={true}
          warningMessage={`Are you sure you want to permanently remove the user account for ${userToDelete.fullName} (${userToDelete.email})? This user will immediately lose access to the platform.`}
          requireReason={true}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
};
