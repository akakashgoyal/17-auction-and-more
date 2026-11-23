import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Property } from '../types';
import { Flame, Info, RefreshCw, Clock, CheckCircle2, Pause, Play, X } from 'lucide-react';
import { useApi } from '../context/ApiContext';

interface LatestAuctionsTickerProps {
  properties: Property[];
  onSelectProperty: (property: Property) => void;
}

const MANUAL_REFRESH_COOLDOWN_MS = 60_000;

export const LatestAuctionsTicker: React.FC<LatestAuctionsTickerProps> = ({
  properties,
  onSelectProperty,
}) => {
  const { lastPropertiesSyncAt, refreshProperties, isLoadingProperties } = useApi();
  const [isUpdateInfoOpen, setIsUpdateInfoOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastManualCheckAt, setLastManualCheckAt] = useState<number>(0);
  const [cooldownLeftSec, setCooldownLeftSec] = useState<number>(0);
  const [checkStatusMsg, setCheckStatusMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!lastManualCheckAt) return;
    const tick = () => {
      const remainingMs = Math.max(0, MANUAL_REFRESH_COOLDOWN_MS - (Date.now() - lastManualCheckAt));
      setCooldownLeftSec(Math.ceil(remainingMs / 1000));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lastManualCheckAt]);

  useEffect(() => {
    if (!isUpdateInfoOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsUpdateInfoOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isUpdateInfoOpen]);

  // Format currency concisely
  const formatTickerPrice = (val?: number) => {
    if (!val || val <= 0) return null;
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)} Lac`;
    return `₹${val.toLocaleString('en-IN')}`;
  };

  // Build meaningful, dynamic message without any invented or fake text
  const getTickerItem = (prop: Property) => {
    const title = prop.title.trim();
    const city = prop.location?.city?.trim() || prop.cityName?.trim();
    const state = prop.location?.state?.trim() || prop.stateName?.trim();
    const locationStr = city ? `${city}${state && state !== city ? `, ${state}` : ''}` : '';
    const propType = prop.propertySubType?.trim() || prop.propertyType?.trim() || '';
    const priceStr = formatTickerPrice(prop.reservePrice);

    let prefix = 'Latest Auction';
    if (prop.featured) {
      prefix = 'Special Auction';
    } else if (prop.auctionCategory) {
      prefix = `${prop.auctionCategory} Auction`;
    }

    let detailPart = '';
    if (locationStr && propType) {
      detailPart = `${propType} in ${locationStr}`;
    } else if (locationStr) {
      detailPart = `in ${locationStr}`;
    } else if (propType) {
      detailPart = propType;
    }

    return {
      prefix,
      title,
      detailPart,
      priceStr,
      property: prop,
    };
  };

  // Filter and deterministically order published properties (featured/newest first)
  const validProperties = useMemo(() => {
    const list = (properties || []).filter(
      (p) => Boolean(p && p.id && p.title && p.title.trim() !== '')
    );

    return [...list].sort((a, b) => {
      const aFeatured = a.featured ? 1 : 0;
      const bFeatured = b.featured ? 1 : 0;
      if (bFeatured !== aFeatured) return bFeatured - aFeatured;

      const aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      if (bTime !== aTime) return bTime - aTime;

      const aId = Number(a.id) || 0;
      const bId = Number(b.id) || 0;
      return bId - aId;
    });
  }, [properties]);

  const tickerItems = useMemo(() => {
    return validProperties.slice(0, 10).map(getTickerItem);
  }, [validProperties]);

  // If no properties, do NOT render the ticker at all (zero whitespace)
  if (tickerItems.length === 0) {
    return null;
  }

  // Calm, comfortable reading speed: ~14s per unique item (minimum 75s per full pass)
  const animationDurationSeconds = Math.max(75, tickerItems.length * 14);

  // Duplicate items to ensure seamless infinite continuous scroll loop
  const scrollLoop = [...tickerItems, ...tickerItems];

  const handleControlledRefresh = async () => {
    if (cooldownLeftSec > 0 || isLoadingProperties) return;
    setLastManualCheckAt(Date.now());
    setCheckStatusMsg(null);
    await refreshProperties(undefined, true);
    setCheckStatusMsg('Feed is up to date.');
  };

  const formattedSyncTime = lastPropertiesSyncAt
    ? lastPropertiesSyncAt.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Synced on load';

  return (
    <div
      ref={containerRef}
      className="w-full bg-[#142533] text-white border-b border-white/10 relative select-none"
      role="region"
      aria-label="Latest & Special Auction Announcements Ticker"
    >
      <div className="w-full max-w-[1500px] mx-auto flex items-center">
        {/* Left Fixed Badge: WHAT'S NEW + Controlled Update Guide */}
        <div className="relative z-20 flex items-center gap-1.5 pl-3 sm:pl-6 lg:pl-12 py-2 pr-2.5 sm:pr-3 bg-[#142533] border-r border-white/10 shrink-0 shadow-md">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#D89B30] text-[#142533] font-mono font-extrabold text-[10px] sm:text-[11px] uppercase tracking-wider shadow-xs shrink-0">
            <Flame className="w-3.5 h-3.5 fill-[#142533] text-[#142533]" />
            <span>WHAT'S NEW</span>
          </span>

          <button
            type="button"
            onClick={() => setIsUpdateInfoOpen((prev) => !prev)}
            aria-expanded={isUpdateInfoOpen}
            aria-label="How What's New updates work"
            title="How What's New updates work & sync status"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-mono font-semibold transition-colors cursor-pointer shrink-0 ${
              isUpdateInfoOpen
                ? 'bg-white/15 border-[#D89B30]/60 text-[#D89B30]'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Info className="w-3 h-3 text-[#D89B30]" />
            <span className="hidden md:inline">Updates</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            aria-label={isPaused ? 'Resume ticker scroll' : 'Pause ticker scroll'}
            title={isPaused ? 'Resume scrolling' : 'Pause scrolling'}
            className="hidden sm:inline-flex items-center justify-center w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>

          {/* Controlled Update Process Explanation Popover */}
          {isUpdateInfoOpen && (
            <div className="absolute left-3 sm:left-6 lg:left-12 top-full mt-2 w-[calc(100vw-24px)] max-w-sm rounded-2xl bg-[#0F1E2B] border border-[#D89B30]/40 shadow-2xl p-4 text-left z-50 space-y-3 select-text">
              <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D89B30] block">
                    What's New • Update Schedule
                  </span>
                  <h4 className="text-sm font-bold text-white mt-0.5">
                    How New Auctions Are Reflected
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUpdateInfoOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close update information"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#D89B30] shrink-0 mt-0.5" />
                  <span>
                    Verified auction mandates and bank sale offers appear here automatically once published from the editorial desk.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#D89B30] shrink-0 mt-0.5" />
                  <span>
                    Updates sync on a controlled <strong className="text-white">5-minute cycle</strong> at a calm reading pace so listings never jump abruptly while you browse.
                  </span>
                </li>
              </ul>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 text-[11px] font-mono">
                <div className="text-slate-400">
                  <div>Last synced: <span className="text-slate-200 font-semibold">{formattedSyncTime}</span></div>
                  <div className="text-[10px] text-slate-400">{tickerItems.length} featured mandates shown</div>
                </div>

                <button
                  type="button"
                  onClick={handleControlledRefresh}
                  disabled={cooldownLeftSec > 0 || isLoadingProperties}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D89B30] hover:bg-[#C58920] disabled:bg-white/10 disabled:text-slate-400 text-[#142533] font-bold text-[11px] transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingProperties ? 'animate-spin' : ''}`} />
                  <span>
                    {isLoadingProperties
                      ? 'Syncing...'
                      : cooldownLeftSec > 0
                      ? `Synced (${cooldownLeftSec}s)`
                      : 'Check Updates'}
                  </span>
                </button>
              </div>

              {checkStatusMsg && (
                <p className="text-[11px] text-emerald-300 font-medium">
                  {checkStatusMsg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Smooth Scrolling Continuous Marquee Track */}
        <div className="relative flex-1 overflow-hidden group py-2">
          {/* Subtle gradient fades on edges */}
          <div className="absolute left-0 inset-y-0 w-6 bg-gradient-to-r from-[#142533] to-transparent z-5 pointer-events-none" />
          <div className="absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-[#142533] to-transparent z-5 pointer-events-none" />

          <div
            className="animate-ticker-scroll flex items-center"
            style={{
              animationDuration: `${animationDurationSeconds}s`,
              animationPlayState: isPaused ? 'paused' : undefined,
            }}
          >
            {scrollLoop.map((item, idx) => (
              <div key={`${item.property.id}-${idx}`} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectProperty(item.property)}
                  className="inline-flex items-center gap-2 px-3 py-0.5 rounded text-left group/item hover:bg-white/5 transition-all cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-[#D89B30]"
                  title={`View property details: ${item.title}`}
                >
                  <span className="inline-block px-1.5 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-amber-300 font-mono font-bold text-[10px] uppercase tracking-wider shrink-0">
                    {item.prefix}
                  </span>

                  <span className="font-semibold text-slate-100 group-hover/item:text-[#D89B30] group-hover/item:underline underline-offset-2 transition-colors text-xs shrink-0">
                    {item.title}
                  </span>

                  {item.detailPart && (
                    <span className="text-slate-400 text-[11px] shrink-0 font-medium">
                      • {item.detailPart}
                    </span>
                  )}

                  {item.priceStr && (
                    <span className="inline-block px-2 py-0.5 rounded bg-white/10 text-emerald-300 font-mono text-[10px] font-bold shrink-0">
                      Reserve: {item.priceStr}
                    </span>
                  )}
                </button>

                {/* Separator between items */}
                <span className="text-slate-600 font-bold px-3 select-none">
                  ✦
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
