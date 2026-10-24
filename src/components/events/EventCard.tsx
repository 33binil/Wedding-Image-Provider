import { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  MapPin,
  Users,
  ArrowUpRight,
  QrCode,
  FolderCheck,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  FolderSync,
  Loader2,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { WeddingEvent } from '../../types/index.js';
import { formatDate } from '../../lib/utils.js';
import { eventService } from '../../services/event.service.js';
import { Button } from '../ui/Button.js';

interface EventCardProps {
  event: WeddingEvent;
  onSelect: (event: WeddingEvent) => void;
  onOpenQr?: (event: WeddingEvent) => void;
  onRetryDriveFolder?: (event: WeddingEvent) => void;
}

export function EventCard({
  event,
  onSelect,
  onOpenQr,
  onRetryDriveFolder,
}: EventCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [indexing, setIndexing] = useState<{
    status: 'IDLE' | 'INDEXING' | 'COMPLETED' | 'FAILED';
    progress: { current: number; total: number };
    indexedCount: number;
    totalDiscovered?: number;
    noFaceImages?: number;
    failed?: number;
    facesFound?: number;
    error?: string;
  } | null>(null);
  const [indexingLoading, setIndexingLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coupleNames = [event.brideName, event.groomName].filter(Boolean).join(' & ');

  const statusLabel = {
    UPCOMING: 'Upcoming Celebration',
    ACTIVE: 'Active Event',
    COMPLETED: 'Ceremony Completed',
    ARCHIVED: 'Archived',
  }[event.status] || event.status;

  const statusColor = {
    UPCOMING: 'text-amber-800 bg-amber-50/70 border-amber-200/50',
    ACTIVE: 'text-emerald-800 bg-emerald-50/70 border-emerald-200/50',
    COMPLETED: 'text-stone-600 bg-stone-100 border-stone-200',
    ARCHIVED: 'text-stone-400 bg-stone-50 border-stone-100',
  }[event.status] || 'text-stone-600 bg-stone-100';

  const isFolderCreated = Boolean(
    event.driveFolderId && (event.driveFolderStatus === 'CREATED' || !event.driveFolderStatus)
  );
  const isFolderFailed = event.driveFolderStatus === 'FAILED';
  const isFolderPending = event.driveFolderStatus === 'PENDING';

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRetryDriveFolder) return;
    try {
      setRetrying(true);
      await onRetryDriveFolder(event);
    } finally {
      setRetrying(false);
    }
  };

  // Indexing state
  const isFolderReady = Boolean(event.driveFolderId && event.driveFolderStatus === 'CREATED');

  useEffect(() => {
    if (!pollRef.current) return;
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = async () => {
    stopPolling();
    await refreshIndexingStatus();
    pollRef.current = setInterval(refreshIndexingStatus, 3000);
  };

  const refreshIndexingStatus = async () => {
    try {
      const status = await eventService.getIndexingStatus(event._id);
      setIndexing({
        status: status.status,
        progress: status.progress,
        indexedCount: status.indexedCount || 0,
        totalDiscovered: status.totalDiscovered,
        noFaceImages: status.noFaceImages,
        failed: status.failed,
        facesFound: status.facesFound,
        error: status.error,
      });
      if (status.status === 'COMPLETED' || status.status === 'FAILED') {
        stopPolling();
      }
    } catch {
      // Ignore polling errors; status will remain as-is
    }
  };

  const handleStartIndexing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndexingLoading(true);
    try {
      await eventService.startIndexing(event._id);
      setIndexing({
        status: 'INDEXING',
        progress: { current: 0, total: 0 },
        indexedCount: 0,
      });
      await startPolling();
    } catch (err: any) {
      const msg = err.message || 'Failed to start indexing';
      if (msg.includes('already') || msg.includes('INDEXING_IN_PROGRESS')) {
        setIndexing({
          status: 'INDEXING',
          progress: { current: 0, total: 0 },
          indexedCount: 0,
          error: 'Indexing is already in progress for this event.',
        });
        await startPolling();
      } else {
        setIndexing({
          status: 'FAILED',
          progress: { current: 0, total: 0 },
          indexedCount: 0,
          error: msg,
        });
      }
    } finally {
      setIndexingLoading(false);
    }
  };

  const handleResetIndexing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Reset the face index for this event? This will clear all indexed faces and allow re-indexing from scratch.')) {
      return;
    }
    setIndexingLoading(true);
    try {
      await eventService.resetIndexing(event._id);
      setIndexing(null);
      stopPolling();
    } catch (err: any) {
      setIndexing(prev => prev ? { ...prev, error: err.message || 'Reset failed' } : null);
    } finally {
      setIndexingLoading(false);
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  return (
    <div
      onClick={() => onSelect(event)}
      className="group relative bg-white border border-stone-200/80 hover:border-[#D6C4AA] rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
    >
      <div>
        {/* Editorial Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-stone-500 font-medium flex-wrap">
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${statusColor}`}>
              {statusLabel}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              {formatDate(event.eventDate)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
            {onOpenQr && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenQr(event);
                }}
                className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                title="View Guest QR Code"
              >
                <QrCode className="w-4 h-4" />
              </button>
            )}
            <div className="p-1.5 text-stone-400 group-hover:text-stone-900 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Title & Couple */}
        <div className="mt-3.5">
          <h3 className="text-lg font-serif font-medium text-stone-900 group-hover:text-stone-950 transition-colors line-clamp-1">
            {event.title}
          </h3>

          {coupleNames && (
            <p className="text-sm text-stone-600 mt-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="font-medium text-stone-800 truncate">{coupleNames}</span>
            </p>
          )}

          {event.venue && (
            <p className="text-xs text-stone-500 mt-1.5 flex items-center gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-stone-400" />
              <span>{event.venue}</span>
            </p>
          )}

          {event.description && (
            <p className="text-xs text-stone-500 mt-3 line-clamp-2 leading-relaxed">
              {event.description}
            </p>
          )}
        </div>
      </div>

      {/* Footer Info & Google Drive Folder Badge */}
      <div className="mt-5 pt-3.5 border-t border-stone-100 flex items-center justify-between gap-2 text-[11px] text-stone-500">
        <div>
          {isFolderCreated ? (
            <a
              href={
                event.driveFolderWebViewLink ||
                `https://drive.google.com/drive/folders/${event.driveFolderId}`
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition-colors"
              title="Open Google Drive Album Folder"
            >
              <FolderCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Drive Album</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ) : isFolderFailed ? (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying || !onRetryDriveFolder}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              title={
                onRetryDriveFolder
                  ? event.driveFolderError || 'Folder creation failed — click to retry'
                  : event.driveFolderError || 'Folder creation failed'
              }
            >
              {retrying ? (
                <RefreshCw className="w-3 h-3 text-rose-600 animate-spin" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-rose-600" />
              )}
              <span>{retrying ? 'Retrying...' : 'Retry Folder'}</span>
            </button>
          ) : isFolderPending ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
              <RefreshCw className="w-3 h-3 text-amber-600 animate-spin" />
              <span>Creating Folder</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
              <FolderSync className="w-3 h-3 text-stone-400" />
              <span>No Drive Folder</span>
            </span>
          )}
        </div>

        <span className="text-stone-400 group-hover:text-stone-700 transition-colors">
          Manage event &rarr;
        </span>
      </div>

      {/* Index Wedding Photos Section */}
      {isFolderReady && (
        <div className="mt-4 pt-3 border-t border-stone-100">
          {indexing ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-stone-600">
                  {indexing.status === 'INDEXING' ? 'Indexing Photos' : indexing.status === 'COMPLETED' ? 'Indexing Complete' : 'Indexing Failed'}
                </span>
                {indexing.status === 'INDEXING' && (
                  <Loader2 className="w-3 h-3 text-[#9C7D4F] animate-spin" />
                )}
                {indexing.status === 'COMPLETED' && (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                )}
                {indexing.status === 'FAILED' && (
                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                )}
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5">
                <div
                  className="bg-[#9C7D4F] h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${indexing.progress.total > 0 ? Math.round((indexing.progress.current / indexing.progress.total) * 100) : 0}%` }}
                />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-stone-500">
                <span>{indexing.progress.current} / {indexing.progress.total} photos</span>
                <span>·</span>
                <span>{indexing.indexedCount} indexed</span>
                {indexing.totalDiscovered && indexing.totalDiscovered > 0 && (
                  <>
                    <span>·</span>
                    <span>{indexing.totalDiscovered} discovered</span>
                  </>
                )}
                {indexing.noFaceImages && indexing.noFaceImages > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-700">{indexing.noFaceImages} no faces</span>
                  </>
                )}
                {indexing.failed && indexing.failed > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-rose-700">{indexing.failed} failed</span>
                  </>
                )}
                {indexing.error && (
                  <span className="text-rose-600">{indexing.error}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {indexing.status === 'INDEXING' && (
                  <Button variant="outline" size="sm" onClick={handleResetIndexing} isLoading={indexingLoading} disabled={indexingLoading}>
                    Reset
                  </Button>
                )}
                {indexing.status === 'FAILED' && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleResetIndexing} isLoading={indexingLoading} disabled={indexingLoading}>
                      Retry
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleStartIndexing} isLoading={indexingLoading} disabled={indexingLoading}>
                      Re-index
                    </Button>
                  </>
                )}
                {indexing.status === 'COMPLETED' && (
                  <Button variant="outline" size="sm" onClick={handleStartIndexing} isLoading={indexingLoading} disabled={indexingLoading}>
                    Re-index
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartIndexing}
              isLoading={indexingLoading}
              disabled={indexingLoading}
              className="w-full"
              leftIcon={<Eye className="w-3.5 h-3.5" />}
            >
              Index Wedding Photos
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
