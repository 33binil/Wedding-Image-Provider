import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Calendar, Sparkles, RefreshCw, AlertCircle, HeartHandshake } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { EventCard } from '../components/events/EventCard.js';
import { Modal } from '../components/ui/Modal.js';
import { QrCodeViewer } from '../components/ui/QrCodeViewer.js';
import { eventService } from '../services/event.service.js';
import { WeddingEvent, EventStats } from '../types/index.js';
import { useToast } from '../hooks/useToast.js';
import { useAuth } from '../hooks/useAuth.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const { error: showError } = useToast();
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

  return (
    <div className="space-y-8">
      {/* Account Status / Trial Banners */}
      {access?.isSuspended && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-rose-900 leading-relaxed">
            <span className="font-semibold block text-sm text-rose-950">Studio Account Suspended</span>
            Your studio account has been suspended by Penta Prizm administrators. Creating new events and editing existing records is temporarily restricted. Please contact <a href="mailto:admin@pentaprizm.com" className="font-semibold underline">admin@pentaprizm.com</a> for assistance.
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
            Manage ceremonies, monitor Google Drive albums, and distribute guest QR codes.
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
            <span className="text-xs text-stone-500">awaiting ceremony</span>
          </div>
        </div>

        <div className="p-5 bg-white border border-stone-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 block">
            Active
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
        {/* Interactive Segmented Filter Controls */}
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

        {/* Search input */}
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
    </div>
  );
}
