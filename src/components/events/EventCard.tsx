import { Calendar, MapPin, Users, ArrowUpRight, QrCode } from 'lucide-react';
import { WeddingEvent } from '../../types/index.js';
import { formatDate } from '../../lib/utils.js';

interface EventCardProps {
  event: WeddingEvent;
  onSelect: (event: WeddingEvent) => void;
  onOpenQr?: (event: WeddingEvent) => void;
}

export function EventCard({ event, onSelect, onOpenQr }: EventCardProps) {
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

  return (
    <div
      onClick={() => onSelect(event)}
      className="group relative bg-white border border-stone-200/80 hover:border-[#D6C4AA] rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
    >
      <div>
        {/* Editorial Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-stone-500 font-medium">
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
                className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors"
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
              <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
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

      {/* Footer Info */}
      <div className="mt-5 pt-3.5 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
        <span className="font-mono">Token: {event.publicToken.substring(0, 8)}...</span>
        <span className="text-stone-400">Manage event &rarr;</span>
      </div>
    </div>
  );
}
