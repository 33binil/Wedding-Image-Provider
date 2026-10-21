import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Edit3,
  Trash2,
  RefreshCw,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { QrCodeViewer } from '../components/ui/QrCodeViewer.js';
import { DriveStatusCard } from '../components/events/DriveStatusCard.js';
import { EventForm, EventFormData } from '../components/events/EventForm.js';
import { eventService } from '../services/event.service.js';
import { WeddingEvent } from '../types/index.js';
import { useToast } from '../hooks/useToast.js';
import { formatLongDate } from '../lib/utils.js';

export default function EventDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [event, setEvent] = useState<WeddingEvent | null>(null);
  const [publicUrl, setPublicUrl] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadEvent = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await eventService.getEventById(id);
      setEvent(data.event);
      setPublicUrl(data.publicUrl);
      setQrCodeDataUrl(data.qrCodeDataUrl);
    } catch (err: any) {
      showError('Failed to load wedding details', err.message);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, showError]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  const handleUpdate = async (formData: EventFormData) => {
    if (!id) return;
    try {
      setIsSubmitting(true);
      const updated = await eventService.updateEvent(id, {
        title: formData.title,
        brideName: formData.brideName || undefined,
        groomName: formData.groomName || undefined,
        eventDate: formData.eventDate,
        venue: formData.venue || undefined,
        description: formData.description || undefined,
        coverImageUrl: formData.coverImageUrl || undefined,
        status: formData.status,
      });
      setEvent(updated);
      setIsEditModalOpen(false);
      success('Event Updated', 'Wedding details have been saved.');
    } catch (err: any) {
      showError('Update Failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      setIsSubmitting(true);
      await eventService.deleteEvent(id);
      success('Event Deleted', 'Wedding event has been removed.');
      navigate('/dashboard');
    } catch (err: any) {
      showError('Delete Failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-stone-400">
        <RefreshCw className="w-8 h-8 animate-spin text-[#9C7D4F] mb-3" />
        <p className="text-xs font-medium uppercase tracking-wider text-stone-500 font-mono">
          Loading wedding event...
        </p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="py-16 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-serif font-semibold text-stone-900">Event Not Found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const coupleNames = [event.brideName, event.groomName].filter(Boolean).join(' & ');

  const statusColor = {
    UPCOMING: 'text-amber-800 bg-amber-50/70 border-amber-200/50',
    ACTIVE: 'text-emerald-800 bg-emerald-50/70 border-emerald-200/50',
    COMPLETED: 'text-stone-600 bg-stone-100 border-stone-200',
    ARCHIVED: 'text-stone-400 bg-stone-50 border-stone-100',
  }[event.status] || 'text-stone-600 bg-stone-100';

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Navigation back and header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Weddings</span>
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-stone-900 tracking-tight">
              {event.title}
            </h1>
            <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium border ${statusColor}`}>
              {event.status}
            </span>
          </div>
          {coupleNames && (
            <p className="text-sm text-stone-600 mt-1 flex items-center gap-1.5 font-medium">
              <Users className="w-4 h-4 text-[#9C7D4F]" />
              <span>{coupleNames}</span>
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditModalOpen(true)}
            leftIcon={<Edit3 className="w-4 h-4" />}
          >
            Edit Event
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-rose-700 border-rose-200 hover:bg-rose-50"
            onClick={() => setIsDeleteModalOpen(true)}
            leftIcon={<Trash2 className="w-4 h-4" />}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Main Grid: Left = Information & Drive, Right = QR & Guest Link */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Ceremony Details Card */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 pb-2 border-b border-stone-100">
              Celebration Schedule & Venue
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-[#ECE5D8]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" /> Ceremony Date
                </span>
                <p className="text-sm font-semibold text-stone-900 mt-1">
                  {formatLongDate(event.eventDate)}
                </p>
              </div>

              <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-[#ECE5D8]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-stone-400" /> Venue & Location
                </span>
                <p className="text-sm font-semibold text-stone-900 mt-1">
                  {event.venue || 'No venue specified'}
                </p>
              </div>
            </div>

            {event.description && (
              <div className="pt-2">
                <span className="text-xs font-semibold text-stone-700 block mb-1">
                  Description & Notes
                </span>
                <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-line bg-stone-50 p-3.5 rounded-xl border border-stone-100">
                  {event.description}
                </p>
              </div>
            )}

            {event.coverImageUrl && (
              <div className="pt-2">
                <span className="text-xs font-semibold text-stone-700 block mb-2">
                  Guest Page Banner Preview
                </span>
                <div className="h-44 rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                  <img
                    src={event.coverImageUrl}
                    alt={event.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Google Drive Integration Card */}
          <DriveStatusCard event={event} onEventUpdated={loadEvent} />
        </div>

        {/* Right Column (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Guest QR Code Viewer */}
          <QrCodeViewer
            title={event.title}
            publicUrl={publicUrl}
            qrCodeDataUrl={qrCodeDataUrl}
          />

          {/* Next Stage Roadmap Notice */}
          <div className="p-5 bg-gradient-to-br from-[#FAF8F5] to-[#F2EDE2] border border-[#E0D5C1] rounded-2xl shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8A6B3E] uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-[#8A6B3E]" />
              <span>Stage 2 Architecture Preview</span>
            </div>
            <h4 className="font-serif text-sm font-semibold text-stone-900 mt-1.5">
              Guest Face Recognition Pipeline
            </h4>
            <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
              When guests scan this wedding's QR code on their phones, they will access the public gallery.
              In Stage 2, guests will snap a quick selfie and the AI face scanner will index photos directly from your Google Drive folder.
            </p>
          </div>
        </div>
      </div>

      {/* Edit Event Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Wedding Event"
        description="Modify wedding date, couple names, venue, or status."
        maxWidth="lg"
      >
        <EventForm
          initialData={event}
          onSubmit={handleUpdate}
          isLoading={isSubmitting}
          onCancel={() => setIsEditModalOpen(false)}
          submitLabel="Save Changes"
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Wedding Event"
        description="Are you sure you want to permanently delete this event registry?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600 leading-relaxed">
            This action cannot be undone. All guest links and QR access tokens associated with{' '}
            <strong>{event.title}</strong> will be permanently deactivated.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              isLoading={isSubmitting}
            >
              Confirm Deletion
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
