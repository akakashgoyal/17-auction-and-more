import { Property, AuthorityProperty, AuctionAsset } from '../types';
import { BlogPost } from '../data/blogData';
import { formatINR } from './storage';
import { getPropertyFallbackImage, DEFAULT_PROPERTY_FALLBACK_IMAGE } from '../data/fallbackImages';
import { OFFICIAL_SITE_URL, buildEntitySlug, parsePathname } from './routes';

export interface GeneratedMetadata {
  title: string;
  ogTitle: string;
  description: string;
  includeSocialDescription?: boolean;
  imageUrl: string;
  imageType?: string;
  url: string;
  type: string;
  siteName: string;
  propertyId?: string;
  referenceNo?: string;
  lotNo?: string;
  priceFormatted?: string;
  locationText?: string;
  jsonLd: Record<string, any>;
}

export function inferImageMimeType(url?: string | null): string {
  if (!url) return 'image/jpeg';
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export function sanitizeText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ensures an image URL is an absolute HTTPS/HTTP URL for social media scrapers
 */
export function ensureAbsoluteImageUrl(url?: string | null, baseUrl: string = OFFICIAL_SITE_URL): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return DEFAULT_PROPERTY_FALLBACK_IMAGE;
  }
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const cleanPath = trimmed.replace(/^\/+/, '');
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Generate complete Open Graph, Twitter, and Schema.org metadata for a Bank Auction Property
 */
export function generatePropertyMetadata(
  property: Partial<Property>,
  baseUrl: string = OFFICIAL_SITE_URL,
  preferredSlugOrId?: string
): GeneratedMetadata {
  const propId = String(property.id || '');
  const refNo = property.propertyReferenceNo || property.auctionReferenceNo || '';
  const rawTitle = sanitizeText(property.title) || 'Verified Bank Auction Property';
  const propType = property.propertyType || property.category || 'Residential';
  const bankName =
    (property.bank_name && property.bank_name.trim()) ||
    (property.bankName && property.bankName.trim()) ||
    property.authority ||
    'Verified Bank Mandate';
  const possession = property.possessionStatus || 'Physical Possession';

  // Format Location
  const locParts = [
    property.location?.locality,
    property.location?.city || property.cityName,
    property.location?.state || property.stateName,
  ].filter(Boolean) as string[];
  const uniqueLocParts = Array.from(new Set(locParts.map((p) => p.trim()))).filter(Boolean);
  const locationText = uniqueLocParts.join(', ') || 'India';

  // Price formatting
  const reservePrice = Number(property.reservePrice || 0);
  const emdAmount = Number(property.emdAmount || 0);
  const priceFormatted = reservePrice > 0 ? formatINR(reservePrice) : 'Reserve Price on Request';
  const emdFormatted = emdAmount > 0 ? ` (EMD: ${formatINR(emdAmount)})` : '';

  // Title: Share strictly ONLY the property title across all platforms
  const ogTitle = rawTitle;
  const pageTitle = refNo
    ? `${rawTitle} (Ref: ${refNo}) | ${bankName} Auction | Auctions & More`
    : `${rawTitle} | ${bankName} Auction | Auctions & More`;

  // Description: Clear, property-specific snippet with Reserve Price, Bank, Location, and Description excerpt
  const rawDesc = sanitizeText(property.description);
  const descExcerpt = rawDesc
    ? rawDesc.length > 140
      ? `${rawDesc.slice(0, 137).trimEnd()}...`
      : rawDesc
    : '';

  const descParts: string[] = [
    refNo ? `Ref No: ${refNo}.` : '',
    `${propType} property under ${bankName} auction in ${locationText}.`,
    `Reserve Price: ${priceFormatted}${emdFormatted}.`,
    descExcerpt || `Possession: ${possession}. Verified SARFAESI/DRT mandate on Auctions & More.`,
  ].filter(Boolean);
  const description = descParts.join(' ');

  // Image resolution: Must be absolute and never empty
  let imageUrl = '';
  if (property.images && property.images.length > 0 && property.images[0]) {
    imageUrl = ensureAbsoluteImageUrl(property.images[0], baseUrl);
  } else {
    imageUrl = getPropertyFallbackImage(propType);
  }
  const imageType = inferImageMimeType(imageUrl);

  // Canonical Property URL matching property slug cleanly
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const canonicalSegment =
    (property.slug && property.slug.trim()) ||
    (preferredSlugOrId && preferredSlugOrId.trim()) ||
    propId;
  const encodedSegment = encodeURIComponent(canonicalSegment).replace(/%2F/gi, '/');
  const propertyUrl = canonicalSegment ? `${cleanBase}/property/${encodedSegment}` : `${cleanBase}/`;

  // Structured Data (RealEstateListing)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: ogTitle,
    description: description,
    url: propertyUrl,
    image: imageUrl,
    identifier: `${propId}`,
    datePosted: property.auctionDate || undefined,
    category: propType,
    offers: {
      '@type': 'Offer',
      price: reservePrice > 0 ? reservePrice : undefined,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      validFrom: property.auctionDate || undefined,
      description: `Reserve Price: ${priceFormatted}`,
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: property.location?.city || property.cityName || undefined,
      addressRegion: property.location?.state || property.stateName || undefined,
      addressCountry: 'IN',
      streetAddress: property.location?.address || locationText,
    },
  };

  return {
    title: pageTitle,
    ogTitle,
    description,
    includeSocialDescription: false,
    imageUrl,
    imageType,
    url: propertyUrl,
    type: 'article',
    siteName: 'Auctions & More',
    propertyId: propId,
    referenceNo: refNo || undefined,
    priceFormatted,
    locationText,
    jsonLd,
  };
}

/**
 * Generate metadata for Authority Properties (DDA, YEIDA, HUDA, UPSIDA, etc.)
 */
export function generateAuthorityPropertyMetadata(
  prop: Partial<AuthorityProperty>,
  baseUrl: string = OFFICIAL_SITE_URL
): GeneratedMetadata {
  const propId = String(prop.id || '');
  const refNo = prop.property_code || prop.reference_no || `AUTH-${propId}`;
  const lotNo = prop.lot_no || 'Lot 1';
  const authorityName = prop.authority?.name || 'Development Authority';
  const rawTitle = sanitizeText(prop.title) || `${authorityName} Property`;
  const locationText = [prop.city_name, prop.state_name].filter(Boolean).join(', ') || 'India';

  const reservePrice = Number(prop.reserve_price || 0);
  const emdAmount = Number(prop.emd_amount || 0);
  const priceFormatted = reservePrice > 0 ? formatINR(reservePrice) : 'Reserve Price on Request';
  const emdFormatted = emdAmount > 0 ? ` (EMD: ${formatINR(emdAmount)})` : '';

  const ogTitle = rawTitle;
  const pageTitle = `${rawTitle} (Listing ID: ${propId}, Lot: ${lotNo}) | ${authorityName} | Auctions & More`;

  const description = `Listing ID: ${propId} (Ref: ${refNo}, Lot: ${lotNo}). ${authorityName} auction in ${locationText}. Reserve Price: ${priceFormatted}${emdFormatted}. Verified institutional listing. Explore details on Auctions & More.`;

  let rawImg = prop.primary_image || (prop.images && prop.images[0] ? prop.images[0].image_url : null);
  const imageUrl = ensureAbsoluteImageUrl(rawImg, baseUrl);
  const propSlug = buildEntitySlug(prop.title, prop.id);
  const propertyUrl = `${baseUrl.replace(/\/+$/, '')}/authority-properties/${propSlug || propId}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: ogTitle,
    description: description,
    url: propertyUrl,
    image: imageUrl,
    identifier: `${propId}`,
    offers: {
      '@type': 'Offer',
      price: reservePrice > 0 ? reservePrice : undefined,
      priceCurrency: 'INR',
    },
  };

  return {
    title: pageTitle,
    ogTitle,
    description,
    includeSocialDescription: false,
    imageUrl,
    url: propertyUrl,
    type: 'article',
    siteName: 'Auctions & More',
    propertyId: propId,
    referenceNo: refNo,
    lotNo,
    priceFormatted,
    locationText,
    jsonLd,
  };
}

/**
 * Generate metadata for Industrial Plant, Machinery, and Scrap Assets
 */
export function generateAuctionAssetMetadata(
  asset: Partial<AuctionAsset>,
  baseUrl: string = OFFICIAL_SITE_URL
): GeneratedMetadata {
  const assetId = String(asset.id || '');
  const refNo = asset.reference_no || `ASSET-${assetId}`;
  const lotNo = asset.lot_no || (asset.quantity ? `${asset.quantity} ${asset.unit || ''}`.trim() : 'Lot 1');
  const category = asset.category || 'Industrial Asset';
  const rawTitle = sanitizeText(asset.title) || `${category} Auction`;
  const locationText = [asset.city, asset.state].filter(Boolean).join(', ') || 'India';

  const reservePrice = Number(asset.reserve_price || 0);
  const priceFormatted = reservePrice > 0 ? formatINR(reservePrice) : 'Price on Request';

  const ogTitle = rawTitle;
  const pageTitle = `${rawTitle} (Listing ID: ${assetId}) | ${category} Auction | Auctions & More`;

  const description = `Listing ID: ${assetId} (Ref: ${refNo}, Lot: ${lotNo}). ${category} auction in ${locationText}. Reserve: ${priceFormatted}. Verified commercial liquidation. View catalog on Auctions & More.`;

  const imageUrl = ensureAbsoluteImageUrl(asset.asset_image, baseUrl);
  const assetSlug = buildEntitySlug(asset.title, asset.id);
  const assetUrl = `${baseUrl.replace(/\/+$/, '')}/auction-asset/${assetSlug || assetId}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: ogTitle,
    description,
    url: assetUrl,
    image: imageUrl,
    identifier: `${assetId}`,
    category,
    offers: {
      '@type': 'Offer',
      price: reservePrice > 0 ? reservePrice : undefined,
      priceCurrency: 'INR',
    },
  };

  return {
    title: pageTitle,
    ogTitle,
    description,
    includeSocialDescription: false,
    imageUrl,
    url: assetUrl,
    type: 'product',
    siteName: 'Auctions & More',
    propertyId: assetId,
    referenceNo: refNo,
    lotNo,
    priceFormatted,
    locationText,
    jsonLd,
  };
}

/**
 * Generate metadata for Blog articles
 */
export function generateBlogMetadata(
  blog: Partial<BlogPost>,
  baseUrl: string = OFFICIAL_SITE_URL
): GeneratedMetadata {
  const blogId = String(blog.slug || blog.id || '');
  const rawTitle = sanitizeText(blog.title) || 'Bank Auction Insights & Guide';
  const pageTitle = blog.seo_title || `${rawTitle} | Auctions & More Advisory`;
  const ogTitle = rawTitle;
  const description = sanitizeText(blog.seo_description || blog.excerpt || blog.content?.slice(0, 160)) ||
    'Read expert advisory insights, SARFAESI procedures, and bank auction intelligence on Auctions & More.';

  const imageUrl = ensureAbsoluteImageUrl(blog.cover_image || (typeof blog.image === 'string' ? blog.image : null), baseUrl);
  const blogUrl = `${baseUrl.replace(/\/+$/, '')}/blog/${blogId}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: rawTitle,
    description,
    image: imageUrl,
    url: blogUrl,
    datePublished: blog.published_at,
    author: {
      '@type': 'Organization',
      name: blog.author_name || 'Auctions & More Advisory Counsel',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Auctions & More',
    },
  };

  return {
    title: pageTitle,
    ogTitle,
    description,
    includeSocialDescription: false,
    imageUrl,
    url: blogUrl,
    type: 'article',
    siteName: 'Auctions & More',
    jsonLd,
  };
}

/**
 * Generate default website metadata
 */
export function generateDefaultMetadata(baseUrl: string = OFFICIAL_SITE_URL): GeneratedMetadata {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return {
    title: "Auctions & More — India's Premier Distressed Asset Platform",
    ogTitle: "Auctions & More — India's Premier Distressed Asset Platform",
    description: "India's premier distressed asset and bank auction platform at auctionsandmore.in. Explore SARFAESI, IBC and DRT properties with live bidding updates, deadline alerts, and tailored investor matching.",
    includeSocialDescription: false,
    imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    url: `${cleanBase}/`,
    type: 'website',
    siteName: 'Auctions & More',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Auctions & More',
      alternateName: 'Auctions & More Pvt Ltd',
      url: cleanBase,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${cleanBase}/properties?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  };
}

/**
 * Generate dedicated single-page Open Graph, Twitter, and Schema.org metadata for any website route
 */
export function generatePageMetadata(
  pathnameOrUrl: string = '/',
  baseUrl: string = OFFICIAL_SITE_URL
): GeneratedMetadata {
  const cleanBase = baseUrl.replace(/\/+$/, '');

  let normalizedPath = '/';
  const rawInput = (pathnameOrUrl || '/').trim();
  if (/^https?:\/\//i.test(rawInput)) {
    try {
      const parsedUrl = new URL(rawInput);
      normalizedPath = parsedUrl.pathname || '/';
    } catch {
      normalizedPath = '/';
    }
  } else {
    const [pathOnly] = rawInput.split('?');
    const noHash = pathOnly.split('#')[0].trim();
    normalizedPath = noHash.startsWith('/') ? noHash : `/${noHash}`;
  }
  if (normalizedPath.length > 1) {
    normalizedPath = normalizedPath.replace(/\/+$/, '');
  }

  const route = parsePathname(normalizedPath);
  const canonicalPath =
    route.page === 'home'
      ? '/'
      : route.page === 'not-found'
      ? '/404'
      : normalizedPath || '/';
  const pageUrl = canonicalPath === '/' ? `${cleanBase}/` : `${cleanBase}${canonicalPath}`;

  const PAGE_META_MAP: Record<
    string,
    { title: string; description: string; imageUrl?: string }
  > = {
    home: {
      title: "Auctions & More — India's Premier Distressed Asset Platform",
      description:
        "India's premier distressed asset and bank auction platform. Explore SARFAESI, IBC and DRT properties across India.",
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    about: {
      title: 'About Auctions & More — Mandate Advisory & Distressed Asset Specialists',
      description:
        'Learn about Auctions & More Pvt Ltd, our institutional mandate expertise, legal due diligence, and distressed asset advisory across India.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    property: {
      title: 'Verified Bank Auction Properties Across India | Auctions & More',
      description:
        'Browse verified SARFAESI, IBC, and DRT bank auction properties across residential, commercial, and industrial categories.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    'authority-properties': {
      title: 'Government & Development Authority Properties | Auctions & More',
      description:
        'Explore DDA, YEIDA, HUDA, UPSIDA and statutory development authority auction properties.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    'authority-wise-properties': {
      title: 'Authority-Wise Property Directory | Auctions & More',
      description:
        'Filter and browse verified government authority properties organized by statutory development authority.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    'scrap-auctions': {
      title: 'Industrial Scrap Auctions & Material Lots | Auctions & More',
      description:
        'Verified ferrous, non-ferrous, e-waste, and industrial scrap auction lots across India.',
      imageUrl:
        'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
    },
    'plant-machinery-auctions': {
      title: 'Plant & Machinery Auctions | Auctions & More',
      description:
        'Verified industrial plant, manufacturing machinery, and equipment liquidation auctions.',
      imageUrl:
        'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
    },
    'auction-management': {
      title: 'Industrial Auction Asset Management Desk | Auctions & More',
      description:
        'Manage institutional scrap and plant & machinery auction assets on Auctions & More.',
      imageUrl:
        'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
    },
    blogs: {
      title: 'Bank Auction Insights, SARFAESI Guides & Advisory | Auctions & More',
      description:
        'Read legal guides, SARFAESI Act insights, bidding strategies, and auction market updates.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    faq: {
      title: 'Frequently Asked Questions — Bank Auction Guide | Auctions & More',
      description:
        'Answers to common questions about EMD deposits, e-auction bidding, possession, and title clearance.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    contact: {
      title: 'Contact Auctions & More — Investor Advisory & Helpdesk',
      description:
        'Reach out to our auction advisory desk for site inspections, EMD support, and mandate inquiries.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    privacy: {
      title: 'Privacy Policy | Auctions & More',
      description: 'Privacy Policy and data protection practices at Auctions & More.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    terms: {
      title: 'Terms & Conditions | Auctions & More',
      description: 'Terms and Conditions governing platform access and auction advisory services.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
    'not-found': {
      title: 'Page Not Found | Auctions & More',
      description: 'The requested page could not be found on Auctions & More.',
      imageUrl: DEFAULT_PROPERTY_FALLBACK_IMAGE,
    },
  };

  if (route.page === 'home' && !normalizedPath.startsWith('/home') && normalizedPath === '/') {
    return generateDefaultMetadata(baseUrl);
  }

  const pageConfig = PAGE_META_MAP[route.page] || PAGE_META_MAP.home;

  return {
    title: pageConfig.title,
    ogTitle: pageConfig.title,
    description: pageConfig.description,
    includeSocialDescription: false,
    imageUrl: pageConfig.imageUrl || DEFAULT_PROPERTY_FALLBACK_IMAGE,
    url: pageUrl,
    type: 'website',
    siteName: 'Auctions & More',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: pageConfig.title,
      description: pageConfig.description,
      url: pageUrl,
      isPartOf: {
        '@type': 'WebSite',
        name: 'Auctions & More',
        url: cleanBase,
      },
    },
  };
}

/**
 * Update document head tags client-side (for SPA page transitions)
 */
export function updateClientPageMetadata(meta: GeneratedMetadata): void {
  if (typeof document === 'undefined') return;

  // 1. Page Title
  document.title = meta.title;

  // Helper to set or create a meta tag
  const setMeta = (attributeName: string, attributeValue: string, content: string) => {
    let el = document.querySelector(`meta[${attributeName}="${attributeValue}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attributeName, attributeValue);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  const removeMeta = (attributeName: string, attributeValue: string) => {
    const el = document.querySelector(`meta[${attributeName}="${attributeValue}"]`);
    if (el) {
      el.remove();
    }
  };

  const includeDesc = meta.includeSocialDescription !== false;

  // 2. Standard & Social Description (omitted on individual listings so platforms show Image + Title + Link only)
  if (includeDesc && meta.description) {
    setMeta('name', 'description', meta.description);
    setMeta('property', 'og:description', meta.description);
    setMeta('name', 'twitter:description', meta.description);
  } else {
    removeMeta('name', 'description');
    removeMeta('property', 'og:description');
    removeMeta('name', 'twitter:description');
  }

  // 3. Open Graph Tags
  setMeta('property', 'og:title', meta.ogTitle);
  setMeta('property', 'og:image', meta.imageUrl);
  setMeta('property', 'og:image:secure_url', meta.imageUrl);
  setMeta('property', 'og:image:type', meta.imageType || inferImageMimeType(meta.imageUrl));
  setMeta('property', 'og:image:width', '1200');
  setMeta('property', 'og:image:height', '630');
  setMeta('property', 'og:image:alt', meta.ogTitle);
  setMeta('property', 'og:url', meta.url);
  setMeta('property', 'og:type', meta.type);
  setMeta('property', 'og:site_name', meta.siteName);

  // 4. Twitter Card Tags
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', meta.ogTitle);
  setMeta('name', 'twitter:image', meta.imageUrl);
  setMeta('name', 'twitter:url', meta.url);

  // 5. Canonical Link
  let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonicalEl) {
    canonicalEl = document.createElement('link');
    canonicalEl.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.setAttribute('href', meta.url);

  // 6. Schema.org JSON-LD
  let scriptEl = document.querySelector('script[data-dynamic-seo="true"]') as HTMLScriptElement | null;
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.setAttribute('type', 'application/ld+json');
    scriptEl.setAttribute('data-dynamic-seo', 'true');
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(meta.jsonLd);
}

/**
 * Format complete HTML meta tags block for server-side HTML injection
 */
export function renderHtmlHeadTags(meta: GeneratedMetadata): string {
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const includeDesc = meta.includeSocialDescription !== false && Boolean(meta.description);

  return `
    <title>${escapeHtml(meta.title)}</title>
    ${includeDesc ? `<meta name="description" content="${escapeHtml(meta.description)}" />` : ''}
    <link rel="canonical" href="${escapeHtml(meta.url)}" />

    <!-- Open Graph / LinkedIn / Facebook / WhatsApp -->
    <meta property="og:type" content="${escapeHtml(meta.type)}" />
    <meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />
    <meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />
    ${includeDesc ? `<meta property="og:description" content="${escapeHtml(meta.description)}" />` : ''}
    <meta property="og:url" content="${escapeHtml(meta.url)}" />
    <meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(meta.imageUrl)}" />
    <meta property="og:image:type" content="${escapeHtml(meta.imageType || inferImageMimeType(meta.imageUrl))}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(meta.ogTitle)}" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.ogTitle)}" />
    ${includeDesc ? `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />` : ''}
    <meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />
    <meta name="twitter:url" content="${escapeHtml(meta.url)}" />

    <!-- Dynamic Schema.org JSON-LD -->
    <script type="application/ld+json" data-dynamic-seo="true">
${JSON.stringify(meta.jsonLd, null, 2)}
    </script>
  `;
}
