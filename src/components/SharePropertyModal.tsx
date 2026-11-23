import React, { useState } from 'react';
import { Property, AuthorityProperty, AuctionAsset } from '../types';
import { getShareableUrl, OFFICIAL_SITE_URL } from '../utils/routes';
import { useApi } from '../context/ApiContext';
import { getPropertyFallbackImage } from '../data/fallbackImages';
import { PropertyWatermark } from './PropertyWatermark';
import {
  X,
  Share2,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Mail,
  Send,
} from 'lucide-react';

export interface SharePropertyModalProps {
  property?: Property | null;
  authorityProperty?: AuthorityProperty | null;
  auctionAsset?: AuctionAsset | null;
  isOpen: boolean;
  onClose: () => void;
  customBaseUrl?: string;
  customShareUrl?: string;
  isWebsiteShare?: boolean;
}

export const SharePropertyModal: React.FC<SharePropertyModalProps> = ({
  property,
  authorityProperty,
  auctionAsset,
  isOpen,
  onClose,
  customBaseUrl,
  customShareUrl,
  isWebsiteShare = false,
}) => {
  // CRITICAL: All React hooks must be declared unconditionally at the top of the component
  const { settings } = useApi();
  const [copiedLink, setCopiedLink] = useState(false);
  const [useOfficialDomain, setUseOfficialDomain] = useState(false);

  // Early return strictly AFTER all hook calls
  if (!isOpen) return null;

  // Determine active browser origin or official domain
  const currentBrowserOrigin =
    typeof window !== 'undefined' && window.location && window.location.origin
      ? window.location.origin.replace(/\/+$/, '')
      : OFFICIAL_SITE_URL;

  const isLocalhost =
    currentBrowserOrigin.includes('localhost') || currentBrowserOrigin.includes('127.0.0.1');

  // If on localhost or user specifically toggled official domain, use OFFICIAL_SITE_URL.
  // Otherwise use the active current deployment origin so links match where the user is browsing.
  const effectiveBaseUrl =
    customBaseUrl && customBaseUrl.trim()
      ? customBaseUrl.replace(/\/+$/, '')
      : useOfficialDomain || isLocalhost
      ? OFFICIAL_SITE_URL
      : currentBrowserOrigin;

  const isPlatformShare = isWebsiteShare || (!property && !authorityProperty && !auctionAsset);

  // Determine unique clean URL to share
  let shareUrl = effectiveBaseUrl;
  if (customShareUrl && customShareUrl.trim()) {
    const raw = customShareUrl.trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const u = new URL(raw);
        shareUrl = `${effectiveBaseUrl}${u.pathname || ''}${u.search || ''}`;
      } catch {
        shareUrl = raw;
      }
    } else {
      const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
      shareUrl = `${effectiveBaseUrl}${cleanPath}`;
    }
  } else if (property && property.id) {
    shareUrl = getShareableUrl('property-detail', String(property.slug || property.id), effectiveBaseUrl);
  } else if (authorityProperty && authorityProperty.id) {
    shareUrl = getShareableUrl('authority-property-detail', String(authorityProperty.id), effectiveBaseUrl);
  } else if (auctionAsset && auctionAsset.id) {
    shareUrl = getShareableUrl('auction-detail', String(auctionAsset.id), effectiveBaseUrl);
  }

  // Display Image resolution with safe fallback
  let displayImage = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80';
  if (property) {
    displayImage =
      (property.images && property.images.length > 0 ? property.images[0] : '') ||
      getPropertyFallbackImage(property.propertyType);
  } else if (authorityProperty) {
    displayImage =
      authorityProperty.primary_image ||
      (authorityProperty.images && authorityProperty.images.length > 0 ? authorityProperty.images[0].image_url : '') ||
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80';
  } else if (auctionAsset) {
    displayImage =
      auctionAsset.asset_image ||
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80';
  }

  // Strictly clean Title only (no extra description/price/ref suffixes)
  let shareTitle = `${settings?.company_name || 'Auctions & More'} — India's Premier Distressed Asset Platform`;
  if (property && property.title) {
    shareTitle = property.title.trim();
  } else if (authorityProperty && authorityProperty.title) {
    shareTitle = authorityProperty.title.trim();
  } else if (auctionAsset && auctionAsset.title) {
    shareTitle = auctionAsset.title.trim();
  }

  // Robust copy helper with textarea fallback (crucial for iframes)
  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    let success = false;
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        // fallback
      }
    }
    if (!success && typeof document !== 'undefined') {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.warn('Fallback copy failed', err);
      }
    }
    return success;
  };

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Uniform sharing across all platforms: Image (via OG tags) + ONLY Title + Link
  const titleWithLinkText = isPlatformShare ? shareUrl : `${shareTitle}\n${shareUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(titleWithLinkText)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const telegramUrl = isPlatformShare
    ? `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}`
    : `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
  const twitterUrl = isPlatformShare
    ? `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`
    : `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(titleWithLinkText)}`;

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          url: shareUrl,
        });
      } catch {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-[#E2DDD2] overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#142533] text-white p-4 sm:p-5 flex items-center justify-between shrink-0 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 text-[#D89B30] flex items-center justify-center shrink-0 border border-white/10">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#D89B30]">
                <span>
                  {authorityProperty
                    ? 'Statutory Authority Mandate'
                    : auctionAsset
                    ? 'Industrial & Scrap Auction'
                    : isPlatformShare
                    ? 'Official Platform'
                    : 'Verified Bank Auction'}
                </span>
              </div>
              <h3 className="font-serif text-base sm:text-lg font-bold text-white leading-tight">
                {authorityProperty
                  ? 'Share Authority Property'
                  : auctionAsset
                  ? 'Share Auction Asset'
                  : isPlatformShare
                  ? 'Share Platform'
                  : 'Share Property'}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Card Label */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span>Share Preview</span>
            </span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-600" />
              <span>Image + Title Link</span>
            </span>
          </div>

          {/* CLEAN SOCIAL PREVIEW CARD: Image + Only Title (with Link in Title) */}
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl border border-[#E2DDD2] bg-white overflow-hidden shadow-md group hover:border-[#D89B30]/60 transition-all cursor-pointer"
            title={shareTitle}
          >
            {/* Visual Header / Property Image */}
            <div className="relative aspect-16/9 w-full bg-slate-900 overflow-hidden">
              <img
                src={displayImage}
                alt={shareTitle}
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-700"
                referrerPolicy="no-referrer"
              />
              <PropertyWatermark variant="corner" position="top-right" size="sm" />
            </div>

            {/* Only Title with Embedded Link */}
            <div className="p-4 bg-gradient-to-b from-white to-[#FAF8F5] space-y-1.5">
              <h4 className="font-serif text-sm sm:text-base font-bold text-[#142533] line-clamp-2 leading-snug group-hover:text-[#9A6007] group-hover:underline decoration-[#D89B30] underline-offset-4 transition-colors flex items-start justify-between gap-2">
                <span>{shareTitle}</span>
                <ExternalLink className="w-4 h-4 text-[#D89B30] shrink-0 mt-0.5" />
              </h4>
            </div>
          </a>

          {/* SIMPLE DIRECT SHARE LINK BOX */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                Direct Share Link
              </span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                Simple Link
              </span>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-2xl bg-[#FAF8F5] border border-[#E2DDD2]">
              <div className="flex-1 font-mono text-xs text-slate-800 px-2 truncate select-all">
                {shareUrl}
              </div>

              {/* Open / Redirect Link */}
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-[#142533] font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer shadow-2xs"
                title="Open link in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#D89B30]" />
                <span className="hidden sm:inline">Open</span>
              </a>

              {/* Copy Link Button */}
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shrink-0 cursor-pointer shadow-2xs ${
                  copiedLink
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#142533] hover:bg-[#1E3A52] text-white'
                }`}
                title="Copy share link"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ONE-CLICK PLATFORM SHARING (All platforms share clean simple link) */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
              Share Direct Link
            </span>

            {/* Primary Direct Channels: WhatsApp & LinkedIn */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-white shrink-0" />
                <span>Share on WhatsApp</span>
              </a>

              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 rounded-xl bg-[#0A66C2] hover:bg-[#004182] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
                title="Share property card on LinkedIn"
              >
                <svg
                  className="w-4 h-4 fill-current shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                </svg>
                <span>Share on LinkedIn</span>
              </a>
            </div>

            {/* Other Sharing Channels */}
            <div className="grid grid-cols-4 gap-2">
              {/* Telegram */}
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 transition-all flex flex-col items-center justify-center gap-1 text-[11px] font-bold cursor-pointer text-center"
                title="Share link on Telegram"
              >
                <Send className="w-4 h-4 text-sky-600" />
                <span>Telegram</span>
              </a>

              {/* Email */}
              <a
                href={emailUrl}
                className="py-2.5 px-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 transition-all flex flex-col items-center justify-center gap-1 text-[11px] font-bold cursor-pointer text-center"
                title="Share link via Email"
              >
                <Mail className="w-4 h-4 text-blue-600" />
                <span>Email</span>
              </a>

              {/* Twitter / 𝕏 */}
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 transition-all flex flex-col items-center justify-center gap-1 text-[11px] font-bold cursor-pointer text-center"
                title="Share link on Twitter / X"
              >
                <span className="text-xs font-bold">𝕏</span>
                <span>Twitter / X</span>
              </a>

              {/* Native App Picker / More */}
              <button
                type="button"
                onClick={handleNativeShare}
                className="py-2.5 px-2 rounded-xl bg-[#FAF1DE] hover:bg-[#F5E5C4] border border-[#F3DFB4] text-[#9A6007] transition-all flex flex-col items-center justify-center gap-1 text-[11px] font-bold cursor-pointer text-center"
                title="More sharing options"
              >
                <Share2 className="w-4 h-4 text-[#D89B30]" />
                <span>More</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#FAF8F5] border-t border-[#E8E2D5] px-4 sm:px-5 py-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="text-[11px] font-mono text-slate-400">
            Auctions &amp; More • Simple Link Share
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-slate-700 hover:text-[#142533] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
