import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Users,
  UserCheck,
  UserX,
  Mail,
  Clock,
  Sparkles,
  Search,
  Plus,
  LogOut,
  RefreshCw,
  KeyRound,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  History,
  Calendar,
  HeartHandshake,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Modal } from '../../components/ui/Modal.js';
import { useSuperAdminAuth } from '../../hooks/useSuperAdminAuth.js';
import { superadminService } from '../../services/superadmin.service.js';
import { User, Invitation, SuperAdminStats, AdminAuditLogEntry } from '../../types/index.js';
import { useToast } from '../../hooks/useToast.js';
import { formatDate } from '../../lib/utils.js';

export default function SuperAdminDashboard() {
  const { admin, logout, loading: authLoading } = useSuperAdminAuth();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [activeTab, setActiveTab] = useState<'photographers' | 'invitations' | 'audit'>('photographers');
  const [stats, setStats] = useState<SuperAdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Photographers table state
  const [photographers, setPhotographers] = useState<User[]>([]);
  const [loadingPhotographers, setLoadingPhotographers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPhotographersCount, setTotalPhotographersCount] = useState(0);

  // Selected Photographer for Details Modal
  const [selectedPhotographer, setSelectedPhotographer] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [trialUpdateLoading, setTrialUpdateLoading] = useState(false);
  const [extensionDays, setExtensionDays] = useState(30);

  // Invitations state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Create Invitation Modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteStudioName, setInviteStudioName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTrialDays, setInviteTrialDays] = useState(30);
  const [inviteNotes, setInviteNotes] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Revealed Code Modal (shown once after creation)
  const [revealedCodeData, setRevealedCodeData] = useState<{
    studioName: string;
    email: string;
    code: string;
    inviteUrl: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load Dashboard Stats
  const loadStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const data = await superadminService.getStats();
      setStats(data);
    } catch (err: any) {
      showError('Failed to load stats', err.message);
    } finally {
      setLoadingStats(false);
    }
  }, [showError]);

  // Load Photographers
  const loadPhotographers = useCallback(async () => {
    try {
      setLoadingPhotographers(true);
      const res = await superadminService.listPhotographers({
        page: currentPage,
        limit: 10,
        search: searchQuery,
        status: statusFilter,
      });
      setPhotographers(res.photographers);
      setTotalPages(res.pagination.pages || 1);
      setTotalPhotographersCount(res.pagination.total);
    } catch (err: any) {
      showError('Failed to load photographers', err.message);
    } finally {
      setLoadingPhotographers(false);
    }
  }, [currentPage, searchQuery, statusFilter, showError]);

  // Load Invitations
  const loadInvitations = useCallback(async () => {
    try {
      setLoadingInvitations(true);
      const list = await superadminService.listInvitations();
      setInvitations(list);
    } catch (err: any) {
      showError('Failed to load invitations', err.message);
    } finally {
      setLoadingInvitations(false);
    }
  }, [showError]);

  // Load Audit Logs
  const loadAuditLogs = useCallback(async () => {
    try {
      setLoadingAudit(true);
      const logs = await superadminService.getAuditLogs();
      setAuditLogs(logs);
    } catch (err: any) {
      showError('Failed to load audit logs', err.message);
    } finally {
      setLoadingAudit(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!authLoading && !admin) {
      navigate('/superadmin');
    }
  }, [authLoading, admin, navigate]);

  useEffect(() => {
    if (admin) {
      loadStats();
    }
  }, [admin, loadStats]);

  useEffect(() => {
    if (admin && activeTab === 'photographers') {
      const timer = setTimeout(() => {
        loadPhotographers();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [admin, activeTab, loadPhotographers]);

  useEffect(() => {
    if (admin && activeTab === 'invitations') {
      loadInvitations();
    }
  }, [admin, activeTab, loadInvitations]);

  useEffect(() => {
    if (admin && activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [admin, activeTab, loadAuditLogs]);

  const handleLogout = async () => {
    try {
      await logout();
      success('Logged Out', 'Superadmin session terminated safely.');
      navigate('/superadmin');
    } catch {
      navigate('/superadmin');
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingInvite(true);
      const res = await superadminService.createInvitation({
        studioName: inviteStudioName,
        email: inviteEmail,
        trialDays: Number(inviteTrialDays) || 30,
        notes: inviteNotes || undefined,
      });

      // Photographers now sign in with Google, so the invitation is matched
      // automatically by their verified Google email address.
      const inviteUrl = `${window.location.origin}/login`;

      setIsInviteModalOpen(false);
      setRevealedCodeData({
        studioName: res.invitation.studioName,
        email: res.invitation.email,
        code: res.activationCode,
        inviteUrl,
      });

      // Reset form
      setInviteStudioName('');
      setInviteEmail('');
      setInviteTrialDays(30);
      setInviteNotes('');

      success('Invitation Generated', 'Activation code generated successfully.');
      loadStats();
      if (activeTab === 'invitations') loadInvitations();
    } catch (err: any) {
      showError('Invitation Failed', err.message);
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this invitation? The activation code will immediately become invalid.')) {
      return;
    }
    try {
      await superadminService.revokeInvitation(id);
      success('Invitation Revoked', 'The invitation has been invalidated.');
      loadInvitations();
      loadStats();
    } catch (err: any) {
      showError('Revoke Failed', err.message);
    }
  };

  const handleOpenPhotographerDetails = async (id: string) => {
    try {
      setLoadingDetails(true);
      const details = await superadminService.getPhotographerById(id);
      setSelectedPhotographer(details);
    } catch (err: any) {
      showError('Failed to load photographer details', err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleToggleStatus = async (photographer: User) => {
    const nextStatus = photographer.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const confirmMsg =
      nextStatus === 'SUSPENDED'
        ? `Are you sure you want to SUSPEND ${photographer.name}? They will be blocked from accessing their studio account.`
        : `Reactivate studio account for ${photographer.name}?`;

    if (!confirm(confirmMsg)) return;

    try {
      setStatusUpdateLoading(true);
      await superadminService.updatePhotographerStatus(photographer._id || photographer.id, {
        status: nextStatus,
        reason: nextStatus === 'SUSPENDED' ? 'Administrative suspension' : 'Administrative reactivation',
      });
      success('Status Updated', `Photographer is now ${nextStatus.toLowerCase()}.`);
      loadPhotographers();
      loadStats();
      if (selectedPhotographer) {
        handleOpenPhotographerDetails(photographer._id || photographer.id);
      }
    } catch (err: any) {
      showError('Status Update Failed', err.message);
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleExtendTrial = async (photographerId: string) => {
    try {
      setTrialUpdateLoading(true);
      await superadminService.updatePhotographerTrial(photographerId, {
        extensionDays: Number(extensionDays) || 30,
        reason: 'Superadmin manual extension',
      });
      success('Trial Extended', `Extended trial by ${extensionDays} days.`);
      loadPhotographers();
      loadStats();
      handleOpenPhotographerDetails(photographerId);
    } catch (err: any) {
      showError('Extension Failed', err.message);
    } finally {
      setTrialUpdateLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#141210] flex items-center justify-center text-stone-300">
        <RefreshCw className="w-8 h-8 animate-spin text-[#C5A880]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 selection:bg-[#E5D7C0]">
      {/* Executive Dark Topbar */}
      <header className="bg-[#1C1917] text-[#FAF8F5] border-b border-[#2E2822] px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#382F26] to-[#1C1917] border border-[#524436] flex items-center justify-center text-[#E5D7C0]">
            <Shield className="w-5 h-5 text-[#D4B58A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-semibold tracking-tight text-base text-white">
                Penta Prizm
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#C5A880]/20 text-[#D4B58A] border border-[#C5A880]/30 uppercase tracking-wider">
                Super Admin
              </span>
            </div>
            <p className="text-[11px] text-stone-400">Wedding AI Multi-Tenant SaaS Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 pr-3 border-r border-stone-800 text-xs text-stone-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Admin: <strong className="text-white">{admin?.email}</strong></span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsInviteModalOpen(true)}
            className="bg-[#C5A880] hover:bg-[#D4B58A] text-stone-950 border-none font-semibold shadow-xs"
            leftIcon={<Plus className="w-4 h-4 text-stone-950" />}
          >
            Add Photographer
          </Button>

          <button
            onClick={handleLogout}
            className="p-2 text-stone-400 hover:text-rose-400 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
            title="Sign Out of Superadmin"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Metric Cards Overview */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="p-4 bg-white border border-stone-200/90 rounded-2xl shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block">
              Total Studios
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-serif font-bold text-stone-900">
                {loadingStats ? '...' : stats?.totalPhotographers || 0}
              </span>
            </div>
          </div>

          <div className="p-4 bg-white border border-stone-200/90 rounded-2xl shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 block">
              Active Studios
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-serif font-bold text-emerald-800">
                {loadingStats ? '...' : stats?.activePhotographers || 0}
              </span>
            </div>
          </div>

          <div className="p-4 bg-white border border-stone-200/90 rounded-2xl shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 block">
              Suspended
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-serif font-bold text-rose-800">
                {loadingStats ? '...' : stats?.suspendedPhotographers || 0}
              </span>
            </div>
          </div>

          <div className="p-4 bg-white border border-stone-200/90 rounded-2xl shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 block">
              Active Trials
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-serif font-bold text-amber-800">
                {loadingStats ? '...' : stats?.activeTrials || 0}
              </span>
            </div>
          </div>

          <div className="p-4 bg-white border border-stone-200/90 rounded-2xl shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block">
              Expired Trials
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-serif font-bold text-stone-700">
                {loadingStats ? '...' : stats?.expiredTrials || 0}
              </span>
            </div>
          </div>

          <div className="p-4 bg-white border border-stone-200/90 rounded-2xl shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9C7D4F] block">
              Total Weddings
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-serif font-bold text-[#806439]">
                {loadingStats ? '...' : stats?.totalWeddings || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-3 flex-wrap gap-4">
          <div className="flex items-center gap-1 p-1 bg-stone-200/80 rounded-xl">
            <button
              onClick={() => setActiveTab('photographers')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'photographers'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Photographer Studios ({totalPhotographersCount})
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'invitations'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Invitations ({stats?.pendingInvitations || 0} pending)
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Audit Trail
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              loadStats();
              if (activeTab === 'photographers') loadPhotographers();
              if (activeTab === 'invitations') loadInvitations();
              if (activeTab === 'audit') loadAuditLogs();
            }}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>

        {/* TAB 1: PHOTOGRAPHERS LIST */}
        {activeTab === 'photographers' && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg overflow-x-auto">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'ACTIVE', label: 'Active' },
                  { id: 'SUSPENDED', label: 'Suspended' },
                  { id: 'TRIAL_ACTIVE', label: 'In Trial' },
                  { id: 'TRIAL_EXPIRED', label: 'Trial Expired' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setStatusFilter(f.id);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                      statusFilter === f.id
                        ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative sm:w-72">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search studios by name or email..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white text-stone-900 border border-stone-200 rounded-xl pl-9 pr-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF8F5] border-b border-stone-200/80 text-stone-600 uppercase tracking-wider text-[11px] font-semibold">
                      <th className="py-3 px-4">Photographer / Studio</th>
                      <th className="py-3 px-4">Account Status</th>
                      <th className="py-3 px-4">Trial / License</th>
                      <th className="py-3 px-4">Sign-In Method</th>
                      <th className="py-3 px-4 text-center">Weddings</th>
                      <th className="py-3 px-4">Registered</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {loadingPhotographers ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-stone-400">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#9C7D4F] mb-2" />
                          <span>Loading studio accounts...</span>
                        </td>
                      </tr>
                    ) : photographers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-stone-500">
                          No photographers match the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      photographers.map((p) => (
                        <tr
                          key={p._id || p.id}
                          className="hover:bg-stone-50/70 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-stone-900 block">{p.name}</span>
                            <span className="text-stone-500 text-[11px] font-mono">{p.email}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            {p.status === 'ACTIVE' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Active
                              </span>
                            )}
                            {p.status === 'PENDING' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" /> Pending Verification
                              </span>
                            )}
                            {p.status === 'SUSPENDED' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600" /> Suspended
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {p.isTrialExpired ? (
                              <span className="inline-flex items-center gap-1 text-amber-900 font-semibold text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Trial Expired
                              </span>
                            ) : (
                              <div>
                                <span className="text-stone-800 font-medium block">
                                  {p.trialDaysRemaining} days remaining
                                </span>
                                {p.trialExpiresAt && (
                                  <span className="text-[10px] text-stone-400">
                                    Expires {formatDate(p.trialExpiresAt)}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {p.authProvider === 'FIREBASE_GOOGLE' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> Google (Firebase)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-stone-50 text-stone-600 border border-stone-200">
                                Not linked yet
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="font-semibold text-stone-900 bg-stone-100 px-2.5 py-0.5 rounded-full">
                              {p.weddingsCount || 0}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-stone-500">
                            {formatDate(p.createdAt)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPhotographerDetails(p._id || p.id)}
                              >
                                Manage
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-3 bg-[#FAF8F5] border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
                  <span>Page {currentPage} of {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      leftIcon={<ChevronLeft className="w-4 h-4" />}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      rightIcon={<ChevronRight className="w-4 h-4" />}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: INVITATIONS */}
        {activeTab === 'invitations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-lg font-semibold text-stone-900">
                  Studio Activation Invitations
                </h3>
                <p className="text-xs text-stone-500">
                  Photographers can register only by verifying a cryptographically generated 6-digit code.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsInviteModalOpen(true)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Generate New Invitation
              </Button>
            </div>

            <div className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-stone-200/80 text-stone-600 uppercase tracking-wider text-[11px] font-semibold">
                    <th className="py-3 px-4">Invited Studio & Email</th>
                    <th className="py-3 px-4">Invitation Status</th>
                    <th className="py-3 px-4">Trial Length</th>
                    <th className="py-3 px-4">Failed Attempts</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {loadingInvitations ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#9C7D4F] mb-2" />
                        <span>Loading invitations...</span>
                      </td>
                    </tr>
                  ) : invitations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-500">
                        No invitations generated yet.
                      </td>
                    </tr>
                  ) : (
                    invitations.map((inv) => (
                      <tr key={inv._id} className="hover:bg-stone-50/70">
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-stone-900 block">{inv.studioName}</span>
                          <span className="text-stone-500 text-[11px] font-mono">{inv.email}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          {inv.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3" /> Pending Activation
                            </span>
                          )}
                          {inv.status === 'ACCEPTED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <Check className="w-3 h-3" /> Activated
                            </span>
                          )}
                          {inv.status === 'REVOKED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
                              Revoked
                            </span>
                          )}
                          {inv.status === 'EXPIRED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600">
                              Expired
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-stone-700">
                          {inv.trialDays} days trial
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`font-mono ${
                              inv.failedAttempts > 0 ? 'text-rose-600 font-bold' : 'text-stone-500'
                            }`}
                          >
                            {inv.failedAttempts} / 5 attempts
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-stone-500">
                          {formatDate(inv.expiresAt)}
                        </td>
                        <td className="py-3.5 px-4 text-stone-500">
                          {formatDate(inv.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {inv.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleRevokeInvitation(inv._id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT TRAIL */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-serif text-lg font-semibold text-stone-900">
                Penta Prizm Administrative Audit Ledger
              </h3>
              <p className="text-xs text-stone-500">
                Immutable chronological log of invitations, status changes, and trial extensions.
              </p>
            </div>

            <div className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-stone-200/80 text-stone-600 uppercase tracking-wider text-[11px] font-semibold">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Admin</th>
                    <th className="py-3 px-4">Target Type</th>
                    <th className="py-3 px-4">Details / Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {loadingAudit ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-stone-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#9C7D4F] mb-2" />
                        <span>Loading audit records...</span>
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-stone-500">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-stone-50/70">
                        <td className="py-3 px-4 text-stone-500 font-mono text-[11px] whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-stone-900 font-mono text-[11px]">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-stone-600">
                          {log.adminEmail || 'System'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-stone-100 text-stone-700">
                            {log.targetType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-stone-600 text-[11px] font-mono max-w-xs truncate">
                          {JSON.stringify(log.metadata || {})}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* CREATE INVITATION MODAL */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Wedding Photographer Studio"
        description="Penta Prizm invitation generator · Creates a one-time 6-digit activation code"
        maxWidth="md"
      >
        <form onSubmit={handleCreateInvitation} className="space-y-4">
          <Input
            label="Photographer / Studio Name"
            placeholder="e.g. Vance Fine Art Weddings"
            value={inviteStudioName}
            onChange={(e) => setInviteStudioName(e.target.value)}
            required
          />

          <Input
            label="Invited Email Address"
            type="email"
            placeholder="elena@vancestudios.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            helperText="The activation code will be cryptographically locked to this email"
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-700">
              Trial Duration (Days)
            </label>
            <select
              value={inviteTrialDays}
              onChange={(e) => setInviteTrialDays(Number(e.target.value))}
              className="w-full bg-white text-stone-900 border border-stone-300 rounded-lg px-3.5 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              <option value={14}>14 Days Trial</option>
              <option value={30}>30 Days Trial (Standard)</option>
              <option value={60}>60 Days Trial</option>
              <option value={90}>90 Days Extended Trial</option>
              <option value={365}>365 Days (Full Year Access)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-700">
              Administrative Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Internal notes regarding referral or tier..."
              value={inviteNotes}
              onChange={(e) => setInviteNotes(e.target.value)}
              className="w-full bg-white text-stone-900 border border-stone-300 rounded-lg p-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none"
            />
          </div>

          <div className="p-3 bg-[#FDFBF7] border border-[#ECE5D8] rounded-xl text-xs text-stone-600 leading-relaxed">
            The generated 6-digit code will only be stored as a bcrypt hash. You will be shown the activation code once to copy.
          </div>

          <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsInviteModalOpen(false)}
              disabled={creatingInvite}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={creatingInvite}>
              Generate Activation Code
            </Button>
          </div>
        </form>
      </Modal>

      {/* REVEALED CODE MODAL (Shown ONLY once upon creation) */}
      <Modal
        isOpen={Boolean(revealedCodeData)}
        onClose={() => setRevealedCodeData(null)}
        title="Activation Code Generated"
        description="Share this code securely with the invited photographer"
        maxWidth="md"
      >
        {revealedCodeData && (
          <div className="space-y-5 text-stone-800">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900 leading-relaxed">
                <span className="font-semibold block text-sm">Invitation Created For {revealedCodeData.studioName}</span>
                Bound to: <code className="font-mono font-bold">{revealedCodeData.email}</code>.
              </div>
            </div>

            {/* Prominent 6-digit code badge */}
            <div className="text-center p-6 bg-[#1C1917] rounded-2xl border border-stone-700 text-[#FAF8F5] shadow-inner">
              <span className="text-[11px] uppercase tracking-widest text-[#C5A880] font-semibold block mb-2">
                6-Digit Activation Code
              </span>
              <div className="font-mono text-4xl sm:text-5xl font-bold tracking-[0.25em] text-white">
                {revealedCodeData.code}
              </div>
              <p className="text-[11px] text-stone-400 mt-2 font-mono">
                Single-use · Valid for 7 days
              </p>
            </div>

            {/* Direct Invitation Link */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 block mb-1">
                Direct Pre-Filled Registration Link
              </label>
              <div className="flex items-center gap-2 p-2 bg-stone-100 border border-stone-200 rounded-xl">
                <input
                  type="text"
                  readOnly
                  value={revealedCodeData.inviteUrl}
                  className="w-full bg-transparent text-xs text-stone-800 font-mono select-all focus:outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(revealedCodeData.inviteUrl);
                    setCopiedLink(true);
                    success('Copied', 'Invitation link copied to clipboard.');
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-200 rounded transition-colors cursor-pointer"
                  title="Copy link"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>Important:</strong> This plaintext code will not be visible again once this dialog is closed.
                The studio account is created automatically the first time the photographer signs in with
                the Google account matching <strong>{revealedCodeData.email}</strong>, and the invitation
                trial length is applied automatically.
              </span>
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(revealedCodeData.code);
                  setCopiedCode(true);
                  success('Code Copied', 'Activation code copied.');
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                leftIcon={copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              >
                {copiedCode ? 'Copied Code' : 'Copy Code'}
              </Button>

              <Button variant="primary" size="sm" onClick={() => setRevealedCodeData(null)}>
                I Have Saved The Code
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* PHOTOGRAPHER DETAILS MODAL */}
      <Modal
        isOpen={Boolean(selectedPhotographer)}
        onClose={() => setSelectedPhotographer(null)}
        title={selectedPhotographer?.photographer?.name || 'Studio Details'}
        description="Manage photographer status, subscription trial, and view metrics"
        maxWidth="lg"
      >
        {selectedPhotographer && (
          <div className="space-y-6 text-xs text-stone-700">
            {/* Studio Info Overview */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-[#FAF8F5] border border-stone-200 rounded-2xl">
              <div>
                <span className="text-stone-400 uppercase tracking-wider text-[10px] block">Contact Email</span>
                <span className="font-mono text-sm text-stone-900 font-semibold">{selectedPhotographer.photographer.email}</span>
              </div>
              <div>
                <span className="text-stone-400 uppercase tracking-wider text-[10px] block">Account Status</span>
                <span
                  className={`inline-block font-semibold px-2 py-0.5 rounded text-[11px] mt-0.5 ${
                    selectedPhotographer.photographer.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {selectedPhotographer.photographer.status}
                </span>
              </div>
              <div>
                <span className="text-stone-400 uppercase tracking-wider text-[10px] block">Trial Expiry</span>
                <span className="font-semibold text-stone-900 block mt-0.5">
                  {formatDate(selectedPhotographer.photographer.trialExpiresAt)} (
                  {selectedPhotographer.photographer.trialDaysRemaining} days remaining)
                </span>
              </div>
              <div>
                <span className="text-stone-400 uppercase tracking-wider text-[10px] block">Total Weddings Registered</span>
                <span className="font-serif text-lg font-bold text-stone-900 block">
                  {selectedPhotographer.photographer.weddingsCount} ceremonies
                </span>
              </div>
            </div>

            {/* Trial Extension Controls */}
            <div className="p-4 bg-white border border-stone-200 rounded-2xl space-y-3">
              <h4 className="font-semibold text-sm text-stone-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#9C7D4F]" /> Extend Studio Trial / License
              </h4>
              <p className="text-stone-500 text-xs">
                Add trial days to grant this photographer active event creation privileges.
              </p>
              <div className="flex items-center gap-3">
                {[14, 30, 60, 90].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setExtensionDays(days)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      extensionDays === days
                        ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    +{days} Days
                  </button>
                ))}
                <Button
                  size="sm"
                  variant="primary"
                  isLoading={trialUpdateLoading}
                  onClick={() => handleExtendTrial(selectedPhotographer.photographer._id || selectedPhotographer.photographer.id)}
                >
                  Apply Extension
                </Button>
              </div>
            </div>

            {/* Sign-In Method */}
            <div className="p-4 bg-white border border-stone-200 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-stone-900 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#9C7D4F]" /> Sign-In Method
                </h4>
                <p className="text-stone-500 text-xs mt-0.5">
                  {selectedPhotographer.photographer.authProvider === 'FIREBASE_GOOGLE' ? (
                    <span className="font-semibold text-stone-800">
                      Google Sign-In via Firebase Authentication. The studio links its Google account on first sign-in.
                    </span>
                  ) : (
                    <span className="font-semibold text-stone-800">
                      Not linked to a Google account yet. The studio links its account the first time it signs in with Google.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Account Status Switch (Suspend / Activate) */}
            <div className="p-4 bg-white border border-stone-200 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-stone-900">Account Access Status</h4>
                <p className="text-stone-500 text-xs mt-0.5">
                  {selectedPhotographer.photographer.status === 'ACTIVE'
                    ? 'Photographer currently has active platform access.'
                    : 'Account suspended. Photographer cannot log in or manage galleries.'}
                </p>
              </div>

              <Button
                size="sm"
                variant={selectedPhotographer.photographer.status === 'ACTIVE' ? 'danger' : 'primary'}
                isLoading={statusUpdateLoading}
                onClick={() => handleToggleStatus(selectedPhotographer.photographer)}
              >
                {selectedPhotographer.photographer.status === 'ACTIVE' ? 'Suspend Studio' : 'Reactivate Studio'}
              </Button>
            </div>

            {/* Recent Weddings */}
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-wider text-stone-500 mb-2">
                Recent Wedding Ceremonies
              </h4>
              {selectedPhotographer.recentWeddings?.length === 0 ? (
                <p className="text-stone-400 italic">No weddings registered yet by this photographer.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedPhotographer.recentWeddings.map((w: any) => (
                    <div
                      key={w._id}
                      className="p-3 bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-stone-900 block">{w.title}</span>
                        <span className="text-[11px] text-stone-500">{formatDate(w.eventDate)} · {w.venue || 'No venue'}</span>
                      </div>
                      <span className="text-[10px] font-mono bg-white border border-stone-200 px-2 py-0.5 rounded">
                        {w.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-stone-100 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedPhotographer(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
