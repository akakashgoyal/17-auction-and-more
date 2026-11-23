import dns from 'dns';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeProperty,
  normalizeAuthorityProperty,
  normalizeAuctionAsset,
} from './src/services/api.ts';
import {
  generatePropertyMetadata,
  generateAuthorityPropertyMetadata,
  generateAuctionAssetMetadata,
  generateBlogMetadata,
  generatePageMetadata,
  renderHtmlHeadTags,
  GeneratedMetadata,
} from './src/utils/propertyMetadata.ts';
import { extractEntityId } from './src/utils/routes.ts';

// Ensure Node prefers IPv4 when resolving backend API hostnames to avoid IPv6 connect timeouts
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const distPath = path.resolve(__dirname, 'dist');
const indexHtmlPath = path.resolve(__dirname, 'index.html');
const distIndexHtmlPath = path.resolve(distPath, 'index.html');

const BACKEND_API_BASE = 'https://auction-admin.springstrdg.com/api/v1';

const app = express();
app.use(express.json());

// In-memory cache for resolved metadata (10 minute TTL)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const propertyCache = new Map<string, CacheEntry<any>>();
const authorityPropertyCache = new Map<string, CacheEntry<any>>();
const auctionAssetCache = new Map<string, CacheEntry<any>>();
const blogCache = new Map<string, CacheEntry<any>>();
let propertyCatalogCache: CacheEntry<any[]> | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL_MS) {
    return item.data;
  }
  return null;
}

function setToCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number = 7000): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return await res.json();
        }
        return null;
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return null;
      }
    } catch {
      clearTimeout(timeout);
    }
  }
  return null;
}

/**
 * Determine effective public base URL for the incoming request.
 * Always honors the real incoming host header so preview/prod URLs (and LinkedIn crawlers)
 * never receive an internal dev container URL in og:url or canonical tags.
 */
function getRequestBaseUrl(req: express.Request): string {
  const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const forwardedProto = rawProto.split(',')[0].trim() || 'https';
  const rawHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
  const forwardedHost = rawHost.split(',')[0].trim();

  if (forwardedHost.includes('auctionsandmore.in')) {
    return 'https://auctionsandmore.in';
  }

  const isLocalHost =
    !forwardedHost ||
    forwardedHost.startsWith('localhost') ||
    forwardedHost.startsWith('127.0.0.1') ||
    forwardedHost.startsWith('0.0.0.0');

  if (!isLocalHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'https://auctionsandmore.in';
}

function toTitleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function getCachedPropertyCatalog(): Promise<any[]> {
  if (propertyCatalogCache && Date.now() - propertyCatalogCache.timestamp < CACHE_TTL_MS) {
    return propertyCatalogCache.data;
  }

  const allItems: any[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const json = await fetchJsonWithTimeout(`${BACKEND_API_BASE}/properties?per_page=100&page=${page}`, 7000);
    const pageList = Array.isArray(json?.data) ? json.data : [];
    if (pageList.length === 0) break;
    allItems.push(...pageList);
    lastPage = Number(json?.pagination?.last_page || 1);
    page += 1;
  } while (page <= Math.min(lastPage, 10));

  if (allItems.length > 0) {
    propertyCatalogCache = { data: allItems, timestamp: Date.now() };
  }
  return allItems;
}

function matchesPropertyIdentifier(item: any, clean: string): boolean {
  if (!item) return false;
  const lowerClean = clean.toLowerCase();
  if (String(item.id) === clean) return true;
  if (item.slug && String(item.slug).toLowerCase() === lowerClean) return true;
  if (item.property_title || item.title) {
    const titleSlug = toTitleSlug(String(item.property_title || item.title));
    if (titleSlug && (`${titleSlug}-${item.id}` === lowerClean || titleSlug === lowerClean)) {
      return true;
    }
  }
  return false;
}

/**
 * Fetch property details from Laravel API by ID or slug accurately
 */
async function fetchProperty(idOrSlug: string): Promise<any | null> {
  const clean = idOrSlug.trim();
  if (!clean) return null;

  const cached = getFromCache(propertyCache, clean.toLowerCase());
  if (cached) return cached;

  // Extract potential numeric ID (e.g., "111", "property-slug-111", or "111-property-slug")
  let numericId: string | null = null;
  if (/^\d+$/.test(clean)) {
    numericId = clean;
  } else {
    const matchSuffix = clean.match(/-(\d+)$/);
    if (matchSuffix) numericId = matchSuffix[1];
    const matchPrefix = clean.match(/^(\d+)-/);
    if (matchPrefix) numericId = matchPrefix[1];
  }

  if (numericId) {
    const json = await fetchJsonWithTimeout(`${BACKEND_API_BASE}/properties/${numericId}`, 7000);
    const data = json?.data || json;
    if (data && (data.id || data.property_title || data.title)) {
      setToCache(propertyCache, clean.toLowerCase(), data);
      setToCache(propertyCache, String(data.id), data);
      if (data.slug) setToCache(propertyCache, String(data.slug).toLowerCase(), data);
      return data;
    }
  }

  // Resolve slug across full paginated catalog (no wrong-item fallback)
  const catalog = await getCachedPropertyCatalog();
  const catalogMatch = catalog.find((p) => matchesPropertyIdentifier(p, clean));

  if (catalogMatch) {
    let fullData = catalogMatch;
    if (catalogMatch.id) {
      const detailJson = await fetchJsonWithTimeout(`${BACKEND_API_BASE}/properties/${catalogMatch.id}`, 7000);
      const detailData = detailJson?.data || detailJson;
      if (detailData && (detailData.id || detailData.property_title || detailData.title)) {
        fullData = detailData;
      }
    }
    setToCache(propertyCache, clean.toLowerCase(), fullData);
    if (fullData.id) setToCache(propertyCache, String(fullData.id), fullData);
    if (fullData.slug) setToCache(propertyCache, String(fullData.slug).toLowerCase(), fullData);
    return fullData;
  }

  // Fallback: live search for newly created properties not yet in 10m catalog cache
  const searchQuery = clean.replace(/-/g, ' ');
  const searchJson = await fetchJsonWithTimeout(
    `${BACKEND_API_BASE}/properties?per_page=50&search=${encodeURIComponent(searchQuery)}`,
    7000
  );
  const searchList = Array.isArray(searchJson?.data) ? searchJson.data : [];
  const searchMatch = searchList.find((p: any) => matchesPropertyIdentifier(p, clean));

  if (searchMatch) {
    let fullData = searchMatch;
    if (searchMatch.id) {
      const detailJson = await fetchJsonWithTimeout(`${BACKEND_API_BASE}/properties/${searchMatch.id}`, 7000);
      const detailData = detailJson?.data || detailJson;
      if (detailData && (detailData.id || detailData.property_title || detailData.title)) {
        fullData = detailData;
      }
    }
    setToCache(propertyCache, clean.toLowerCase(), fullData);
    if (fullData.id) setToCache(propertyCache, String(fullData.id), fullData);
    if (fullData.slug) setToCache(propertyCache, String(fullData.slug).toLowerCase(), fullData);
    return fullData;
  }

  return null;
}

/**
 * Fetch Authority Property details from Laravel API
 */
async function fetchAuthorityProperty(idOrSlug: string): Promise<any | null> {
  const clean = idOrSlug.trim();
  const numericId = extractEntityId(clean) || clean;
  const cached = getFromCache(authorityPropertyCache, clean) || getFromCache(authorityPropertyCache, numericId);
  if (cached) return cached;

  const json = await fetchJsonWithTimeout(`${BACKEND_API_BASE}/authority-properties/${encodeURIComponent(numericId)}`, 7000);
  const data = json?.data || json;
  if (data && (data.id || data.title)) {
    setToCache(authorityPropertyCache, clean, data);
    setToCache(authorityPropertyCache, numericId, data);
    return data;
  }
  return null;
}

/**
 * Fetch Auction Asset (Machinery/Scrap) details from Laravel API
 */
async function fetchAuctionAsset(idOrSlug: string): Promise<any | null> {
  const clean = idOrSlug.trim();
  const numericId = extractEntityId(clean) || clean;
  const cached = getFromCache(auctionAssetCache, clean) || getFromCache(auctionAssetCache, numericId);
  if (cached) return cached;

  const json = await fetchJsonWithTimeout(`${BACKEND_API_BASE}/auction-assets/${encodeURIComponent(numericId)}`, 7000);
  const data = json?.data || json;
  if (data && (data.id || data.title)) {
    setToCache(auctionAssetCache, clean, data);
    setToCache(auctionAssetCache, numericId, data);
    return data;
  }
  return null;
}

/**
 * Fetch Blog details from Laravel API
 */
async function fetchBlogPost(slug: string): Promise<any | null> {
  const clean = slug.trim();
  const cached = getFromCache(blogCache, clean);
  if (cached) return cached;

  const json = await fetchJsonWithTimeout(`${BACKEND_API_BASE}/blogs/${encodeURIComponent(clean)}`, 7000);
  const data = json?.data || json;
  if (data && (data.id || data.title)) {
    setToCache(blogCache, clean, data);
    return data;
  }
  return null;
}

/**
 * Inject dynamic Open Graph, Twitter, and Schema.org tags into HTML head
 */
function injectMetaIntoHtml(html: string, headTags: string): string {
  let cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi, '');

  if (cleaned.includes('<head>')) {
    return cleaned.replace('<head>', `<head>\n${headTags}`);
  }
  return `${headTags}\n${cleaned}`;
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Inspector & Debug endpoint for testing Open Graph tags
app.get('/api/og-preview', async (req, res) => {
  const targetPath = (req.query.path as string) || (req.query.url as string) || '/';
  const baseUrl = getRequestBaseUrl(req);

  try {
    const meta = await resolveMetadataForPath(targetPath, baseUrl);
    res.json({
      success: true,
      path: targetPath,
      baseUrl,
      meta,
      htmlSnippet: renderHtmlHeadTags(meta),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

/**
 * Resolve metadata object for any application path
 */
async function resolveMetadataForPath(rawPath: string, baseUrl: string): Promise<GeneratedMetadata> {
  const [pathOnly] = rawPath.split('?');
  let cleanPath = pathOnly.split('#')[0].replace(/\/+$/, '') || '/';
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {
    // keep raw path if malformed URI component
  }
  const lowerPath = cleanPath.toLowerCase();

  // 1. Bank Auction Property Detail: /property/:idOrSlug or /properties/:idOrSlug
  if (lowerPath.startsWith('/property/') || lowerPath.startsWith('/properties/')) {
    const prefix = lowerPath.startsWith('/property/') ? '/property/' : '/properties/';
    const param = cleanPath.slice(prefix.length).trim();
    if (param) {
      const rawProp = await fetchProperty(param);
      if (rawProp) {
        const normalized = normalizeProperty(rawProp);
        return generatePropertyMetadata(normalized, baseUrl, param);
      }
      // Fallback with param ID
      return generatePropertyMetadata(
        {
          id: param,
          title: `Auction Property #${param}`,
          description: `Bank auction mandate #${param}. View verified documents, photos, reserve price, and bidding schedule on Auctions & More.`,
        },
        baseUrl,
        param
      );
    }
  }

  // 2. Authority Property Detail: /authority-properties/:id (excluding catalog sub-paths)
  if (
    lowerPath.startsWith('/authority-properties/') &&
    !lowerPath.startsWith('/authority-properties/authority')
  ) {
    const param = cleanPath.slice('/authority-properties/'.length).trim();
    if (param) {
      const rawProp = await fetchAuthorityProperty(param);
      if (rawProp) {
        const normalized = normalizeAuthorityProperty(rawProp);
        return generateAuthorityPropertyMetadata(normalized, baseUrl);
      }
      return generateAuthorityPropertyMetadata(
        { id: Number(extractEntityId(param)) || 0, title: `Authority Property #${param}` },
        baseUrl
      );
    }
  }

  // 3. Auction Asset Detail (Plant & Machinery / Scrap): /auction-asset/:id or /auction/:id
  if (lowerPath.startsWith('/auction-asset/') || lowerPath.startsWith('/auction/')) {
    const prefix = lowerPath.startsWith('/auction-asset/') ? '/auction-asset/' : '/auction/';
    const param = cleanPath.slice(prefix.length).trim();
    if (param) {
      const rawAsset = await fetchAuctionAsset(param);
      if (rawAsset) {
        const normalized = normalizeAuctionAsset(rawAsset);
        return generateAuctionAssetMetadata(normalized, baseUrl);
      }
      return generateAuctionAssetMetadata(
        { id: Number(extractEntityId(param)) || 0, title: `Auction Asset #${param}` },
        baseUrl
      );
    }
  }

  // 4. Blog Detail: /blog/:slug
  if (lowerPath.startsWith('/blog/')) {
    const param = cleanPath.slice('/blog/'.length).trim();
    if (param) {
      const rawBlog = await fetchBlogPost(param);
      if (rawBlog) {
        return generateBlogMetadata(rawBlog, baseUrl);
      }
    }
  }

  // Dedicated Single-Page Metadata for all website pages (/, /properties, /about, /contact, etc.)
  return generatePageMetadata(cleanPath, baseUrl);
}

// Set up Vite in development mode or serve static files in production
let vite: any = null;
if (!isProduction) {
  const { createServer } = await import('vite');
  vite = await createServer({
    server: { middlewareMode: true, port: PORT, host: '0.0.0.0' },
    appType: 'custom',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(distPath, { maxAge: '1d', index: false }));
}

// SSR Dynamic Meta Tag HTML Generator for all client routes
app.get('*', async (req, res, next) => {
  // If the request has an extension (e.g. .js, .css, .png), pass to next handler
  if (req.path.includes('.') && !req.path.endsWith('.html')) {
    return next();
  }

  try {
    const baseUrl = getRequestBaseUrl(req);
    const meta = await resolveMetadataForPath(req.originalUrl || req.path, baseUrl);
    const headTags = renderHtmlHeadTags(meta);

    let template: string;
    if (!isProduction && vite) {
      const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
      template = await vite.transformIndexHtml(req.originalUrl, rawHtml);
    } else {
      template = fs.readFileSync(distIndexHtmlPath, 'utf-8');
    }

    const finalHtml = injectMetaIntoHtml(template, headTags);
    res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(finalHtml);
  } catch (err: any) {
    console.error('[SEO Server] Error rendering HTML:', err);
    // Fallback: send index.html directly
    try {
      const fallbackFile = isProduction ? distIndexHtmlPath : indexHtmlPath;
      res.sendFile(fallbackFile);
    } catch {
      next(err);
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Auctions & More] Server running on port ${PORT} (${isProduction ? 'production' : 'development'})`);
});
