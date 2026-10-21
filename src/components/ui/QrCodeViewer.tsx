import { useState } from 'react';
import { Copy, Check, Download, ExternalLink, QrCode } from 'lucide-react';
import { Button } from './Button.js';
import { useToast } from '../../hooks/useToast.js';

interface QrCodeViewerProps {
  publicUrl: string;
  qrCodeDataUrl: string;
  title: string;
}

export function QrCodeViewer({ publicUrl, qrCodeDataUrl, title }: QrCodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const { success } = useToast();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      success('Link Copied', 'Guest wedding URL copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = publicUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      success('Link Copied', 'Guest wedding URL copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadQr = () => {
    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    link.download = `${sanitizedTitle}-guest-qr-code.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('QR Code Downloaded', 'High-resolution PNG saved for printing table signs.');
  };

  return (
    <div className="flex flex-col items-center bg-white border border-stone-200/90 rounded-2xl p-6 shadow-sm">
      <div className="w-full flex items-center justify-between pb-4 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-stone-700" />
          <h3 className="text-sm font-semibold text-stone-900 tracking-tight">Guest QR Code & Link</h3>
        </div>
        <span className="text-xs text-stone-500">Live for guests</span>
      </div>

      <div className="mt-6 p-4 bg-[#FDFBF7] border border-[#ECE5D8] rounded-2xl shadow-inner flex flex-col items-center">
        <img
          src={qrCodeDataUrl}
          alt={`Guest QR Code for ${title}`}
          className="w-52 h-52 object-contain rounded-lg"
        />
        <p className="text-[11px] text-stone-500 mt-2 font-mono tracking-tight text-center">
          Scan with any mobile camera
        </p>
      </div>

      {/* Public URL row */}
      <div className="w-full mt-5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Public Wedding Guest Link
        </label>
        <div className="mt-1 flex items-center gap-2 p-2 bg-stone-50 border border-stone-200 rounded-lg">
          <input
            type="text"
            readOnly
            value={publicUrl}
            className="w-full bg-transparent text-xs text-stone-800 font-mono focus:outline-none select-all"
          />
          <button
            onClick={handleCopyLink}
            className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-200 rounded transition-colors cursor-pointer"
            title="Copy URL"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full grid grid-cols-2 gap-3 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadQr}
          leftIcon={<Download className="w-4 h-4" />}
        >
          Download PNG
        </Button>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer select-none rounded-lg text-xs py-1.5 px-3 gap-1.5 bg-[#1C1917] hover:bg-[#292524] text-[#FBF9F5] shadow-sm hover:shadow"
        >
          <ExternalLink className="w-4 h-4" />
          <span>View Public Page</span>
        </a>
      </div>
    </div>
  );
}
