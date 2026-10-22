import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Calendar,
  Sparkles,
  RefreshCw,
  AlertCircle,
  HeartHandshake,
  HardDrive,
  CheckCircle2,
  Unlink,
  ExternalLink,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { EventCard } from '../components/events/EventCard.js';
import { Modal } from '../components/ui/Modal.js';
import { QrCodeViewer } from '../components/ui/QrCodeViewer.js';
import { eventService } from '../services/event.service.js';
import { WeddingEvent, EventStats, DriveStatusResponse } from '../types/index.js';
import { useToast } from '../hooks/useToast.js';
import { useAuth } from '../hooks/useAuth.js';
import { formatDate } from '../lib/utils.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { success, error: showError, info } = useToast();
  const { user, access } = useAuth();

  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [stats, setStats] = useState<EventStats>({ total: 0, upcoming: 0, active: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedEventForQr, setSelectedEventForQr] = useState<{
    event: WeddingEvent;
    publicUrl: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  // Drive integration state
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);
  const [loadingDrive, setLoadingDrive] = useState(true);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const loadDriveStatus = useCallback(async () => {
    try {
      setLoadingDrive(true);
      const res = await eventService.getDriveStatus();
      setDriveStatus(res);
    } catch (err: any) {
      console.warn('Could not load drive status:', err.message);
    } finally {
      setLoadingDrive(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await eventService.listEvents({
        status: statusFilter,
        search: searchTerm,
      });
      setEvents(data.events);
      setStats(data.stats);
    } catch (err: any) {
      showError('Failed to load events', err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchTerm, showError]);

  // Handle Google Drive OAuth callback redirect params
  useEffect(() => {
    const driveParam = searchParams.get('drive');
    const driveError = searchParams.get('drive_error');

    if (driveParam === 'connected') {
      success('Google Drive Connected', 'Your Google Drive account is linked. All new wedding albums will be organized automatically.');
      loadDriveStatus();
      searchParams.delete('drive');
      setSearchParams(searchParams, { replace: true });
    } else if (driveError) {
      const errorMsg =
        driveError === 'access_denied'
          ? 'Google Drive authorization was denied or canceled.'
          : driveError === 'invalid_state'
          ? 'Security state verification failed. Please try connecting again.'
          : 'Could not complete Google Drive authentication.';
      showError('Google Drive Connection Failed', errorMsg);
      searchParams.delete('drive_error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, success, showError, loadDriveStatus]);

  useEffect(() => {
    loadDriveStatus();
  }, [loadDriveStatus]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      loadEvents();
    }, 250);
    return () => clearTimeout(debounceTimer);
  }, [loadEvents]);

  const handleOpenQrModal = async (event: WeddingEvent) => {
    try {
      setLoadingQr(true);
      const res = await eventService.getEventById(event._id);
      setSelectedEventForQr({
        event: res.event,
        publicUrl: res.publicUrl,
        qrCodeDataUrl: res.qrCodeDataUrl,
      });
    } catch (err: any) {
      showError('Failed to generate QR code', err.message);
    } finally {
      setLoadingQr(false);
    }
  };

  const handleConnectDrive = async () => {
    if (!driveStatus?.configured) {
      setShowSetupModal(true);
      return;
    }

    try {
      setConnectingDrive(true);
      const res = await eventService.initiateDriveConnect();
      if (res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        window.location.href = '/api/integrations/google-drive/connect';
      }
    } catch (err: any) {
      if (
        err.message?.includes('not yet configured') ||
        err.message?.includes('GOOGLE_DRIVE_NOT_CONFIGURED')
      ) {
        setShowSetupModal(true);
      } else {
        showError('Connection Error', err.message || 'Failed to initiate Google Drive authentication.');
      }
    } finally {
      setConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = async () => {
    if (
      !confirm(
        'Are you sure you want to disconnect Google Drive? Your existing wedding folders in Google Drive will remain safe, but automatic folder generation will be paused.'
      )
    ) {
      return;
    }

    try {
      setDisconnectingDrive(true);
      await eventService.disconnectDrive();
      success('Google Drive Disconnected', 'Your Google Drive account has been unlinked.');
      await loadDriveStatus();
    } catch (err: any) {
      showError('Disconnection Failed', err.message);
    } finally {
      setDisconnectingDrive(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Account Status / Trial Banners */}
      {access?.isSuspended && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-rose-900 leading-relaxed">
            <span className="font-semibold block text-sm text-rose-950">Studio Account Suspended</span>
            Your studio account has been suspended by Penta Prizm administrators. Creating new events and editing existing records is temporarily restricted. Please contact <a href="mailto:pentaprizmofficial@gmail.com" className="font-semibold underline">pentaprizmofficial@gmail.com</a> for assistance.
          </div>
        </div>
      )}

      {access?.isTrialExpired && !access?.isSuspended && (
        <div className="p-4 bg-amber-50 border border-amber-300/80 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold block text-sm text-amber-950">Studio Trial Period Expired</span>
            Your 30-day studio trial has expired. You can still access and view your existing wedding events and download guest QR codes, but registering new weddings requires account renewal. Please contact Penta Prizm administrators to upgrade your subscription.
          </div>
        </div>
      )}

      {access && !access.isTrialExpired && !access.isSuspended && access.trialDaysRemaining <= 7 && (
        <div className="p-3.5 bg-[#FDFBF7] border border-[#E8DEC9] rounded-xl flex items-center justify-between gap-3 text-xs text-stone-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#9C7D4F]" />
            <span>
              Penta Prizm Studio Trial: <strong>{access.trialDaysRemaining} day(s) remaining</strong>.
            </span>
          </div>
          <span className="text-[11px] text-stone-500">Contact admin for subscription extension</span>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/60">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-stone-900 tracking-tight">
            Wedding Registry & Events
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Manage ceremonies, automatically organize Google Drive albums, and distribute guest QR codes.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => navigate('/events/new')}
          disabled={access?.canCreateWeddings === false}
          title={access?.canCreateWeddings === false ? 'Trial expired or account suspended' : undefined}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Create Wedding
        </Button>
      </div>

      {/* Google Drive Studio Integration Banner */}
      <div className="p-4 bg-white border border-stone-200/90 rounded-2xl shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-stone-100 text-stone-700 shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-stone-900">Google Drive Studio Storage</h3>
                {loadingDrive ? (
                  <span className="text-[11px] text-stone-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  </span>
                ) : driveStatus?.reconnectRequired ? (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-800 rounded-md flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Reconnect Required
                  </span>
                ) : driveStatus?.connected ? (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-md flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Connected
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-stone-100 text-stone-600 rounded-md">
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-600 mt-1">
                {driveStatus?.connected
                  ? `Linked: ${driveStatus.googleEmail || 'Google Account'} · Dedicated folder: "Wedding AI Photo Finder"`
                  : 'Connect your Google Drive to automatically create event photo folders upon wedding creation.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {driveStatus?.connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnectDrive}
                isLoading={disconnectingDrive}
                className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                leftIcon={<Unlink className="w-3.5 h-3.5" />}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleConnectDrive}
                isLoading={connectingDrive}
                leftIcon={<HardDrive className="w-3.5 h-3.5" />}
              >
                Connect Google Drive
              </Button>
            )}

            <button
              onClick={() => setShowSetupModal(true)}
              className="text-xs text-stone-500 hover:text-stone-800 underline underline-offset-4 px-2 py-1 cursor-pointer"
            >
              Setup Guide
            </button>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-stone-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 block">
            Total Weddings
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-serif font-bold text-stone-900">{stats.total}</span>
            <span className="text-xs text-stone-500">events registered</span>
          </div>
        </div>

        <div className="p-5 bg-white border border-stone-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 block">
            Upcoming
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-serif font-bold text-stone-900">{stats.upcoming}</span>
            <span className="text-xs text-stone-500">ceremonies ahead</span>
          </div>
        </div>

        <div className="p-5 bg-white border border-stone-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 block">
            Active Celebrations
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-serif font-bold text-stone-900">{stats.active}</span>
            <span className="text-xs text-stone-500">happening now</span>
          </div>
        </div>

        <div className="p-5 bg-white border border-stone-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-600 block">
            Completed
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-serif font-bold text-stone-900">{stats.completed}</span>
            <span className="text-xs text-stone-500">galleries delivered</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Weddings' },
            { id: 'UPCOMING', label: 'Upcoming' },
            { id: 'ACTIVE', label: 'Active' },
            { id: 'COMPLETED', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by title, couple, or venue..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white text-stone-900 border border-stone-200 rounded-xl pl-9 pr-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>
      </div>

      {/* Events Grid / States */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-stone-400">
          <RefreshCw className="w-8 h-8 animate-spin text-[#9C7D4F] mb-3" />
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500 font-mono">
            Loading wedding events...
          </p>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white border border-[#ECE5D8] rounded-3xl p-10 text-center max-w-lg mx-auto shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#F8F5EE] border border-[#E2D8C6] flex items-center justify-center text-[#9C7D4F] mx-auto mb-4">
            <HeartHandshake className="w-7 h-7" />
          </div>
          <h3 className="font-serif text-xl font-semibold text-stone-900">
            {searchTerm || statusFilter !== 'ALL'
              ? 'No matching weddings found'
              : 'No wedding events registered yet'}
          </h3>
          <p className="text-xs text-stone-500 mt-2 max-w-sm mx-auto leading-relaxed">
            {searchTerm || statusFilter !== 'ALL'
              ? 'Try modifying your search keywords or resetting the status filter.'
              : 'Create your first wedding event to generate a unique guest invitation URL and downloadable QR code for reception signage.'}
          </p>
          <div className="mt-6">
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate('/events/new')}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Create First Wedding
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {events.map((event) => (
            <EventCard
              key={event._id}
              event={event}
              onSelect={(evt) => navigate(`/events/${evt._id}`)}
              onOpenQr={handleOpenQrModal}
            />
          ))}
        </div>
      )}

      {/* QR Code Quick View Modal */}
      <Modal
        isOpen={Boolean(selectedEventForQr)}
        onClose={() => setSelectedEventForQr(null)}
        title={selectedEventForQr?.event.title || 'Guest QR Code'}
        description="Share this QR code with wedding attendees to let them access their photo gallery."
        maxWidth="md"
      >
        {selectedEventForQr && (
          <QrCodeViewer
            title={selectedEventForQr.event.title}
            publicUrl={selectedEventForQr.publicUrl}
            qrCodeDataUrl={selectedEventForQr.qrCodeDataUrl}
          />
        )}
      </Modal>

      {/* Google Cloud Drive Setup Modal */}
      <Modal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        title="Google Drive OAuth Integration Setup"
        description="Follow these steps to connect your photographer Google Drive with least-privilege permissions."
        maxWidth="lg"
      >
        <div className="space-y-4 text-sm text-stone-700">
          <div className="p-3 bg-[#FDFBF7] border border-[#E9DFC7] rounded-xl flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-stone-800 leading-relaxed">
              Google Drive OAuth utilizes offline authorization code flow with AES-256-GCM encrypted refresh tokens and least-privilege scope (<code className="bg-stone-200 px-1 py-0.5 rounded font-mono">drive.file</code>).
              Once keys are configured, all wedding folders are automatically organized under a dedicated <code className="font-semibold text-stone-900">"Wedding AI Photo Finder"</code> parent directory.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">1</span>
              <div>
                <h4 className="font-semibold text-stone-900">Google Cloud Console Project</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Visit <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-stone-900 font-semibold underline inline-flex items-center gap-0.5">console.cloud.google.com <ExternalLink className="w-3 h-3" /></a> and create or select your project.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">2</span>
              <div>
                <h4 className="font-semibold text-stone-900">Enable Google Drive API</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Go to <strong>APIs & Services &gt; Library</strong>, search for <em>Google Drive API</em>, and click <strong>Enable</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">3</span>
              <div>
                <h4 className="font-semibold text-stone-900">OAuth Consent Screen & Scopes</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Go to <strong>APIs & Services &gt; OAuth consent screen</strong>. Select <em>External</em>. Add scope:
                  <code className="block mt-1 p-1.5 bg-stone-100 rounded font-mono text-xs select-all text-stone-800">
                    https://www.googleapis.com/auth/drive.file
                  </code>
                  While the app is in "Testing" mode, make sure to add your photographer Gmail address under <strong>Test Users</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">4</span>
              <div>
                <h4 className="font-semibold text-stone-900">Create OAuth 2.0 Credentials</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Go to <strong>APIs & Services &gt; Credentials &gt; Create Credentials &gt; OAuth client ID</strong>.
                  Select <em>Web application</em>. Add the following <strong>Authorized redirect URIs</strong>:
                </p>
                <div className="mt-1.5 space-y-1.5 font-mono text-xs">
                  <div className="p-2 bg-stone-100 border border-stone-300 rounded text-stone-800 select-all">
                    {window.location.origin}/api/integrations/google-drive/callback
                  </div>
                  <div className="p-2 bg-stone-100 border border-stone-300 rounded text-stone-600 select-all">
                    http://localhost:3000/api/integrations/google-drive/callback
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-900 text-white text-xs font-semibold shrink-0">5</span>
              <div>
                <h4 className="font-semibold text-stone-900">Configure Server Environment (.env)</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Add the credentials to your server environment:
                </p>
                <pre className="mt-1.5 p-2.5 bg-stone-900 text-stone-100 rounded-lg font-mono text-xs overflow-x-auto">
{`GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="${window.location.origin}/api/integrations/google-drive/callback"
TOKEN_ENCRYPTION_KEY="your-32-character-random-secret"`}
                </pre>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-stone-100 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setShowSetupModal(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
