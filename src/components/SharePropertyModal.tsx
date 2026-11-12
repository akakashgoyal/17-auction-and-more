import React, { useState, useCallback } from 'react';
import { Property, AuthorityProperty, AuctionAsset } from '../types';
import { formatINR } from '../utils/storage';
import { getShareableUrl, OFFICIAL_SITE_URL } from '../utils/routes';
import { useApi } from '../context/ApiContext';
import { getPropertyFallbackImage } from '../data/fallbackImages';
import { PropertyWatermark } from './PropertyWatermark';
import {
  X,
  Share2,
  Copy,
  Check,
  Building,
  MapPin,
  Calendar,
  ExternalLink,
  Eye,
  MessageCircle,
  Mail,
  Send,
  ShieldCheck,
  Globe,
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
    shareUrl = getShareableUrl('property-detail', String(property.id), effectiveBaseUrl);
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

  // Location string with safe null guards
  let locationText = 'India';
  if (property) {
    const rawLocParts = [
      property.location?.locality?.trim(),
      property.location?.city?.trim(),
      property.location?.state?.trim(),
    ].filter(Boolean) as string[];
    const uniqueLocParts: string[] = [];
    rawLocParts.forEach((part) => {
      if (!uniqueLocParts.some((p) => p.toLowerCase() === part.toLowerCase())) {
        uniqueLocParts.push(part);
      }
    });
    locationText = uniqueLocParts.join(', ') || property?.location?.city || property?.location?.address || 'India';
  } else if (authorityProperty) {
    locationText = [authorityProperty.city_name, authorityProperty.state_name].filter(Boolean).join(', ') || 'India';
  } else if (auctionAsset) {
    locationText = [auctionAsset.city, auctionAsset.state].filter(Boolean).join(', ') || 'India';
  }

  // Safe share title
  let shareTitle = `${settings?.company_name || 'Auctions & More'} — India's Premier Distressed Asset Platform`;
  if (property && property.title) {
    shareTitle = `${property.title.trim()} | Verified Bank Auction Property`;
  } else if (authorityProperty && authorityProperty.title) {
    shareTitle = `${authorityProperty.title.trim()} | ${authorityProperty.authority?.name || 'Authority Property'}`;
  } else if (auctionAsset && auctionAsset.title) {
    shareTitle = `${auctionAsset.title.trim()} | ${auctionAsset.category || 'Auction Asset'}`;
  }

  // Official bank name for property card preview (strictly for content details, NOT on image)
  const propertyBankName = property
    ? (property.bank_name && property.bank_name.trim()) ||
      (property.bankName && property.bankName.trim()) ||
      ((property.raw as any)?.bank_name && String((property.raw as any).bank_name).trim()) ||
      ''
    : '';

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

  // Uniform simple link sharing across all channels
  // When sharing link directly on WhatsApp/Telegram/Twitter, social platforms automatically render the OpenGraph preview card
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareUrl)}`;

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
              <span>Property Preview</span>
            </span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-600" />
              <span>Direct Link Sharing</span>
            </span>
          </div>

          {/* REAL-ESTATE PROPERTY CARD PREVIEW */}
          <div className="rounded-2xl border border-[#E2DDD2] bg-white overflow-hidden shadow-md group hover:border-[#D89B30]/50 transition-all">
            {/* Visual Header / Property Image */}
            <div className="relative aspect-16/9 w-full bg-slate-900 overflow-hidden">
              <img
                src={displayImage}
                alt={authorityProperty?.title || property?.title || auctionAsset?.title || 'Auctions & More'}
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-700"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10 pointer-events-none" />

              {/* Watermark in Top Right */}
              <PropertyWatermark variant="corner" position="top-right" size="sm" />

              {/* Category / Type Badge on Top Left */}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded-lg bg-[#142533]/90 backdrop-blur-xs text-[#D89B30] text-[10px] font-mono font-bold border border-white/15 shadow-xs">
                  {authorityProperty
                    ? authorityProperty.authority?.short_name || authorityProperty.authority?.name || 'Authority Property'
                    : property
                    ? property.auctionCategory
                      ? `${property.auctionCategory} Auction`
                      : property.propertyType || 'Bank Auction'
                    : auctionAsset
                    ? auctionAsset.category || 'Industrial Asset'
                    : 'Bank Auction Platform'}
                </span>
              </div>

              {/* Location Strip on Bottom */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center gap-1.5 text-white text-xs drop-shadow-md truncate">
                <MapPin className="w-3.5 h-3.5 text-[#D89B30] shrink-0" />
                <span className="truncate font-medium">{locationText}</span>
              </div>
            </div>

            {/* Concise Details & Specs */}
            <div className="p-4 space-y-3 bg-gradient-to-b from-white to-[#FAF8F5]">
              <div>
                <h4 className="font-serif text-sm sm:text-base font-bold text-[#142533] line-clamp-2 leading-snug group-hover:text-[#9A6007] transition-colors">
                  {authorityProperty?.title ||
                    property?.title ||
                    auctionAsset?.title ||
                    "Auctions & More — India's Premier Distressed Asset Platform"}
                </h4>
              </div>

              {/* Compact Metrics Grid */}
              {authorityProperty ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-500 block">Reserve Price</span>
                    <span className="text-sm font-extrabold text-[#142533] font-mono">
                      {authorityProperty.reserve_price ? formatINR(authorityProperty.reserve_price) : 'On Request'}
                    </span>
                  </div>

                  {authorityProperty.emd_amount ? (
                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-500 block">EMD Amount</span>
                      <span className="text-xs font-bold text-slate-700 font-mono">
                        {formatINR(authorityProperty.emd_amount)}
                      </span>
                    </div>
                  ) : authorityProperty.area ? (
                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-500 block">Area</span>
                      <span className="text-xs font-bold text-slate-700 font-mono">
                        {authorityProperty.area} {authorityProperty.area_unit || ''}
                      </span>
                    </div>
                  ) : null}

                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-500 block">Authority</span>
                    <span className="text-xs font-bold text-[#9A6007] truncate block">
                      {authorityProperty.authority?.short_name || authorityProperty.authority?.name || 'Statutory Body'}
                    </span>
                  </div>
                </div>
              ) : property ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-500 block">Reserve Price</span>
                    <span className="text-sm font-extrabold text-[#142533] font-mono">
                      {property.reservePrice > 0 ? formatINR(property.reservePrice) : 'On Request'}
                    </span>
                  </div>

                  {property.emdAmount > 0 && (
                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-500 block">EMD (10%)</span>
                      <span className="text-xs font-bold text-slate-700 font-mono">
                        {formatINR(property.emdAmount)}
                      </span>
                    </div>
                  )}

                  {propertyBankName ? (
                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-500 block">Bank Name</span>
                      <span className="text-xs font-bold text-[#142533] truncate block">
                        {propertyBankName}
                      </span>
                    </div>
                  ) : property.auctionDate ? (
                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-500 block">Auction Date</span>
                      <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#9A6007]" />
                        <span>
                          {new Date(property.auctionDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-500 block">Title Status</span>
                      <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>Verified</span>
                      </span>
                    </div>
                  )}
                </div>
              ) : auctionAsset ? (
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-500 block">Reserve Price</span>
                    <span className="text-sm font-extrabold text-[#142533] font-mono">
                      {auctionAsset.reserve_price ? formatINR(Number(auctionAsset.reserve_price)) : 'On Request'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-500 block">Category</span>
                    <span className="text-xs font-bold text-[#9A6007] truncate block">
                      {auctionAsset.category || 'Plant & Machinery'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-500 block">Platform</span>
                    <span className="text-xs font-bold text-[#142533]">Auctions &amp; More</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-500 block">Coverage</span>
                    <span className="text-xs font-bold text-[#142533]">All Indian States &amp; Banks</span>
                  </div>
                </div>
              )}

              {/* View / Redirect Button */}
              <div className="pt-1">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#142533] hover:bg-[#1E3A52] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md group/btn cursor-pointer"
                  title="Click to open property details"
                >
                  <Eye className="w-4 h-4 text-[#D89B30]" />
                  <span>
                    {authorityProperty
                      ? 'View Authority Property Details'
                      : property
                      ? 'View Property Details'
                      : auctionAsset
                      ? 'View Auction Asset Details'
                      : 'Explore Platform'}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover/btn:text-white group-hover/btn:translate-x-0.5 transition-transform" />
                </a>
              </div>
            </div>
          </div>

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

            {/* WhatsApp (Simple Link Share) */}
            <div>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer"
              >
                <MessageCircle className="w-5 h-5 fill-white" />
                <span>Share Link on WhatsApp</span>
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
