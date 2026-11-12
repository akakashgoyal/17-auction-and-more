import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeProperty } from './src/services/api.ts';
import {
  generatePropertyMetadata,
  generateAuthorityPropertyMetadata,
  generateAuctionAssetMetadata,
  generateBlogMetadata,
  generateDefaultMetadata,
  renderHtmlHeadTags,
  GeneratedMetadata,
} from './src/utils/propertyMetadata.ts';

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

/**
 * Determine effective base URL for the incoming request
 */
function getRequestBaseUrl(req: express.Request): string {
  const forwardedProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'auctionsandmore.in';

  if (forwardedHost.includes('auctionsandmore.in')) {
    return 'https://auctionsandmore.in';
  }

  if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  return `${forwardedProto}://${forwardedHost}`;
}

/**
 * Fetch property details from Laravel API by ID or slug
 */
async function fetchProperty(idOrSlug: string): Promise<any | null> {
  const clean = idOrSlug.trim();
  const cached = getFromCache(propertyCache, clean);
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
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${BACKEND_API_BASE}/properties/${numericId}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const json: any = await res.json();
        const data = json?.data || json;
        if (data && (data.id || data.property_title || data.title)) {
          setToCache(propertyCache, clean, data);
          setToCache(propertyCache, String(data.id), data);
          if (data.slug) setToCache(propertyCache, String(data.slug), data);
          return data;
        }
      }
    } catch {
      // Continue to search fallback
    }
  }

  // Fallback: search by slug or title
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${BACKEND_API_BASE}/properties?search=${encodeURIComponent(clean)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json: any = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      const match = list.find(
        (p: any) =>
          String(p.id) === clean ||
          p.slug === clean ||
          (p.slug && p.slug.toLowerCase() === clean.toLowerCase()) ||
          (p.property_title && p.property_title.toLowerCase().includes(clean.replace(/-/g, ' ').toLowerCase()))
      ) || list[0];

      if (match) {
        setToCache(propertyCache, clean, match);
        return match;
      }
    }
  } catch {
    // Graceful fallback
  }

  return null;
}

/**
 * Fetch Authority Property details from Laravel API
 */
async function fetchAuthorityProperty(id: string): Promise<any | null> {
  const clean = id.trim();
  const cached = getFromCache(authorityPropertyCache, clean);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${BACKEND_API_BASE}/authority-properties/${clean}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json: any = await res.json();
      const data = json?.data || json;
      if (data) {
        setToCache(authorityPropertyCache, clean, data);
        return data;
      }
    }
  } catch {
    // fallback
  }
  return null;
}

/**
 * Fetch Auction Asset (Machinery/Scrap) details from Laravel API
 */
async function fetchAuctionAsset(id: string): Promise<any | null> {
  const clean = id.trim();
  const cached = getFromCache(auctionAssetCache, clean);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${BACKEND_API_BASE}/auction-assets/${clean}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json: any = await res.json();
      const data = json?.data || json;
      if (data) {
        setToCache(auctionAssetCache, clean, data);
        return data;
      }
    }
  } catch {
    // fallback
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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${BACKEND_API_BASE}/blogs/${clean}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json: any = await res.json();
      const data = json?.data || json;
      if (data) {
        setToCache(blogCache, clean, data);
        return data;
      }
    }
  } catch {
    // fallback
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
  const cleanPath = pathOnly.split('#')[0].replace(/\/+$/, '') || '/';
  const lowerPath = cleanPath.toLowerCase();

  // 1. Bank Auction Property Detail: /property/:idOrSlug or /properties/:idOrSlug
  if (lowerPath.startsWith('/property/') || lowerPath.startsWith('/properties/')) {
    const prefix = lowerPath.startsWith('/property/') ? '/property/' : '/properties/';
    const param = cleanPath.slice(prefix.length).trim();
    if (param) {
      const rawProp = await fetchProperty(param);
      if (rawProp) {
        const normalized = normalizeProperty(rawProp);
        return generatePropertyMetadata(normalized, baseUrl);
      }
      // Fallback with param ID
      return generatePropertyMetadata(
        {
          id: param,
          title: `Auction Property #${param}`,
          description: `Bank auction mandate #${param}. View verified documents, photos, reserve price, and bidding schedule on Auctions & More.`,
        },
        baseUrl
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
        return generateAuthorityPropertyMetadata(rawProp, baseUrl);
      }
      return generateAuthorityPropertyMetadata(
        { id: Number(param) || 0, title: `Authority Property #${param}` },
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
        return generateAuctionAssetMetadata(rawAsset, baseUrl);
      }
      return generateAuctionAssetMetadata(
        { id: Number(param) || 0, title: `Auction Asset #${param}` },
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

  // Default: Homepage & Main platform metadata
  return generateDefaultMetadata(baseUrl);
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
