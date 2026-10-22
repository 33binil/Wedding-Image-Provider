import { useState } from 'react';
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
} from 'lucide-react';
import { WeddingEvent } from '../../types/index.js';
import { formatDate } from '../../lib/utils.js';

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
    </div>
  );
}
