<?php
/**
 * Dynamic Open Graph, Twitter Card & Schema.org SSR Metadata Renderer
 * Serves accurate property / page meta tags to LinkedInBot, WhatsApp, Facebook,
 * TelegramBot, Twitterbot, Slackbot, Googlebot, etc. on Hostinger / Apache / LiteSpeed.
 *
 * Normal browser visitors continue receiving the Vite SPA directly via index.html.
 */

declare(strict_types=1);

@ini_set('display_errors', '0');

define('AM_BACKEND_URL', 'https://admin.auctionsandmore.in');
define('AM_API_BASE', AM_BACKEND_URL . '/api/v1');
define('AM_SITE_NAME', 'Auctions & More');
define('AM_OFFICIAL_URL', 'https://auctionsandmore.in');
define('AM_CACHE_TTL', 300); // 5 minutes
define('AM_DEFAULT_IMAGE', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?fit=crop&w=1200&h=630&q=80&fm=jpg');
define('AM_INDUSTRIAL_IMAGE', 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?fit=crop&w=1200&h=630&q=80&fm=jpg');

function am_to_slug(string $text): string {
    $lower = strtolower($text);
    $slug = preg_replace('/[^a-z0-9]+/', '-', $lower);
    return trim((string)$slug, '-');
}

function am_sanitize_text(?string $text): string {
    if ($text === null || $text === '') {
        return '';
    }
    $stripped = strip_tags($text);
    $collapsed = preg_replace('/\s+/', ' ', $stripped);
    return trim((string)$collapsed);
}

function am_escape_html(string $str): string {
    return htmlspecialchars($str, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function am_infer_mime_type(?string $url): string {
    if (!$url) {
        return 'image/jpeg';
    }
    $pathOnly = strtolower((string)parse_url($url, PHP_URL_PATH));
    if (substr($pathOnly, -4) === '.png') {
        return 'image/png';
    }
    if (substr($pathOnly, -5) === '.webp') {
        return 'image/webp';
    }
    if (substr($pathOnly, -4) === '.gif') {
        return 'image/gif';
    }
    return 'image/jpeg';
}

function am_get_fallback_image(?string $propertyType): string {
    $map = [
        'Residential'     => 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?fit=crop&w=1200&h=630&q=80&fm=jpg',
        'Commercial'      => 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?fit=crop&w=1200&h=630&q=80&fm=jpg',
        'Industrial'      => 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?fit=crop&w=1200&h=630&q=80&fm=jpg',
        'Land'            => 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?fit=crop&w=1200&h=630&q=80&fm=jpg',
        'Hospitality'     => 'https://images.unsplash.com/photo-1566073771259-6a8506099945?fit=crop&w=1200&h=630&q=80&fm=jpg',
        'Mixed-Use'       => 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?fit=crop&w=1200&h=630&q=80&fm=jpg',
        'Agricultural'    => 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?fit=crop&w=1200&h=630&q=80&fm=jpg',
        'Institutional'   => 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?fit=crop&w=1200&h=630&q=80&fm=jpg',
        'Special Purpose' => 'https://images.unsplash.com/photo-1577495508048-b635879837f1?fit=crop&w=1200&h=630&q=80&fm=jpg',
    ];
    if ($propertyType && isset($map[$propertyType])) {
        return $map[$propertyType];
    }
    if ($propertyType) {
        $lower = strtolower($propertyType);
        foreach ($map as $key => $url) {
            if (strpos($lower, strtolower($key)) !== false) {
                return $url;
            }
        }
    }
    return AM_DEFAULT_IMAGE;
}

function am_resolve_media_url($rawImg, string $fallback = AM_DEFAULT_IMAGE): string {
    if (empty($rawImg)) {
        return $fallback;
    }

    $candidate = '';
    if (is_string($rawImg)) {
        $candidate = trim($rawImg);
    } elseif (is_array($rawImg)) {
        foreach (['image_url', 'url', 'image_path', 'path', 'file_path'] as $key) {
            if (!empty($rawImg[$key]) && is_string($rawImg[$key])) {
                $candidate = trim($rawImg[$key]);
                break;
            }
        }
    }

    if ($candidate === '' || stripos($candidate, 'data:') === 0) {
        return $fallback;
    }

    if (preg_match('#^https?://#i', $candidate)) {
        if (stripos($candidate, 'http://admin.auctionsandmore.in') === 0) {
            return 'https://' . substr($candidate, 7);
        }
        return $candidate;
    }

    $clean = ltrim($candidate, '/');
    if (strpos($clean, 'storage/') === 0) {
        return AM_BACKEND_URL . '/' . $clean;
    }
    return AM_BACKEND_URL . '/storage/' . $clean;
}

function am_format_inr($amount): string {
    $num = (float)$amount;
    if ($num <= 0) {
        return 'Reserve Price on Request';
    }
    if ($num >= 10000000) {
        return 'Rs. ' . number_format($num / 10000000, 2) . ' Cr';
    }
    if ($num >= 100000) {
        return 'Rs. ' . number_format($num / 100000, 2) . ' Lakh';
    }
    return 'Rs. ' . number_format($num, 0);
}

function am_cache_dir(): ?string {
    $dir = rtrim(sys_get_temp_dir(), '/\\') . '/am_og_cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return is_dir($dir) && is_writable($dir) ? $dir : null;
}

function am_cache_get(string $key): ?array {
    $dir = am_cache_dir();
    if (!$dir) {
        return null;
    }
    $file = $dir . '/' . md5($key) . '.json';
    if (!is_file($file)) {
        return null;
    }
    if ((time() - (int)@filemtime($file)) > AM_CACHE_TTL) {
        @unlink($file);
        return null;
    }
    $raw = @file_get_contents($file);
    if ($raw === false) {
        return null;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function am_cache_set(string $key, array $data): void {
    $dir = am_cache_dir();
    if (!$dir) {
        return;
    }
    $file = $dir . '/' . md5($key) . '.json';
    @file_put_contents($file, json_encode($data), LOCK_EX);
}

function am_http_get_json(string $url, bool $useCache = true): ?array {
    if ($useCache) {
        $cached = am_cache_get($url);
        if ($cached !== null) {
            return $cached;
        }
    }

    $body = false;
    $statusCode = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 3,
                CURLOPT_CONNECTTIMEOUT => 4,
                CURLOPT_TIMEOUT        => 6,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_HTTPHEADER     => [
                    'Accept: application/json',
                    'User-Agent: AuctionsAndMore-OGRender/1.0',
                ],
            ]);
            if (defined('CURL_IPRESOLVE_V4')) {
                curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
            }
            $body = curl_exec($ch);
            $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
        }
    } elseif (ini_get('allow_url_fopen')) {
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'GET',
                'timeout' => 6,
                'header'  => "Accept: application/json\r\nUser-Agent: AuctionsAndMore-OGRender/1.0\r\n",
            ],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        $statusCode = $body !== false ? 200 : 0;
    }

    if ($body === false || !is_string($body) || ($statusCode > 0 && $statusCode >= 400)) {
        return null;
    }

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        return null;
    }

    if ($useCache) {
        am_cache_set($url, $decoded);
    }
    return $decoded;
}

function am_extract_entity_id(?string $slugOrId): string {
    if ($slugOrId === null) {
        return '';
    }
    $clean = trim($slugOrId);
    if ($clean === '') {
        return '';
    }
    if (preg_match('/^\d+$/', $clean)) {
        return $clean;
    }
    if (preg_match('/-(\d+)$/', $clean, $m)) {
        return $m[1];
    }
    if (preg_match('/^(\d+)-/', $clean, $m)) {
        return $m[1];
    }
    return '';
}

function am_matches_property_identifier(array $item, string $clean): bool {
    $lowerClean = strtolower($clean);
    if (isset($item['id']) && (string)$item['id'] === $clean) {
        return true;
    }
    if (!empty($item['slug']) && strtolower(trim((string)$item['slug'])) === $lowerClean) {
        return true;
    }
    $title = (string)($item['property_title'] ?? $item['title'] ?? $item['name'] ?? '');
    if ($title !== '') {
        $titleSlug = am_to_slug($title);
        $id = (string)($item['id'] ?? '');
        if ($titleSlug !== '' && ($titleSlug === $lowerClean || ($id !== '' && $titleSlug . '-' . $id === $lowerClean))) {
            return true;
        }
    }
    return false;
}

function am_fetch_property_catalog(): array {
    $cacheKey = 'property_catalog_all_v1';
    $cached = am_cache_get($cacheKey);
    if ($cached !== null) {
        return $cached;
    }

    $allItems = [];
    $page = 1;
    $lastPage = 1;

    do {
        $json = am_http_get_json(AM_API_BASE . '/properties?per_page=100&page=' . $page, false);
        $pageList = (isset($json['data']) && is_array($json['data'])) ? $json['data'] : [];
        if (empty($pageList)) {
            break;
        }
        foreach ($pageList as $row) {
            if (is_array($row)) {
                $allItems[] = $row;
            }
        }
        $lastPage = (int)($json['pagination']['last_page'] ?? 1);
        $page++;
    } while ($page <= min($lastPage, 10));

    if (!empty($allItems)) {
        am_cache_set($cacheKey, $allItems);
    }
    return $allItems;
}

function am_fetch_property(string $idOrSlug): ?array {
    $clean = trim($idOrSlug);
    if ($clean === '') {
        return null;
    }

    $numericId = am_extract_entity_id($clean);
    if ($numericId !== '') {
        $json = am_http_get_json(AM_API_BASE . '/properties/' . urlencode($numericId));
        $data = (isset($json['data']) && is_array($json['data'])) ? $json['data'] : $json;
        if (is_array($data) && (!empty($data['id']) || !empty($data['property_title']) || !empty($data['title']))) {
            return $data;
        }
    }

    // Resolve slug across cached paginated catalog
    $catalog = am_fetch_property_catalog();
    foreach ($catalog as $item) {
        if (am_matches_property_identifier($item, $clean)) {
            if (!empty($item['id'])) {
                $detailJson = am_http_get_json(AM_API_BASE . '/properties/' . urlencode((string)$item['id']));
                $detailData = (isset($detailJson['data']) && is_array($detailJson['data'])) ? $detailJson['data'] : $detailJson;
                if (is_array($detailData) && (!empty($detailData['id']) || !empty($detailData['property_title']) || !empty($detailData['title']))) {
                    return $detailData;
                }
            }
            return $item;
        }
    }

    // Fallback: live search query for newly published items not in catalog cache
    $searchQuery = trim(str_replace('-', ' ', $clean));
    if ($searchQuery !== '') {
        $searchJson = am_http_get_json(AM_API_BASE . '/properties?per_page=50&search=' . rawurlencode($searchQuery), false);
        $searchList = (isset($searchJson['data']) && is_array($searchJson['data'])) ? $searchJson['data'] : [];
        foreach ($searchList as $item) {
            if (is_array($item) && am_matches_property_identifier($item, $clean)) {
                if (!empty($item['id'])) {
                    $detailJson = am_http_get_json(AM_API_BASE . '/properties/' . urlencode((string)$item['id']));
                    $detailData = (isset($detailJson['data']) && is_array($detailJson['data'])) ? $detailJson['data'] : $detailJson;
                    if (is_array($detailData) && (!empty($detailData['id']) || !empty($detailData['property_title']) || !empty($detailData['title']))) {
                        return $detailData;
                    }
                }
                return $item;
            }
        }
    }

    return null;
}

function am_format_title_with_address(string $rawTitle, ?string $rawAddress, int $maxLen = 195): string {
    $cleanTitle = am_sanitize_text($rawTitle);
    $cleanAddr = am_sanitize_text($rawAddress ?? '');
    $cleanAddr = (string)preg_replace('/,\s*,+/', ',', $cleanAddr);
    $cleanAddr = trim($cleanAddr, " \t\n\r\0\x0B,");
    if ($cleanAddr === '') {
        return $cleanTitle;
    }
    if (stripos($cleanTitle, $cleanAddr) !== false) {
        return $cleanTitle;
    }
    $combined = "{$cleanTitle} — {$cleanAddr}";
    if (strlen($combined) <= $maxLen) {
        return $combined;
    }
    return rtrim(substr($combined, 0, $maxLen - 3)) . '...';
}

function am_build_property_meta(array $raw, string $baseUrl, string $preferredSlug): array {
    $id = (string)($raw['id'] ?? $raw['property_id'] ?? $preferredSlug);
    $rawTitle = am_sanitize_text((string)($raw['property_title'] ?? $raw['title'] ?? $raw['name'] ?? 'Verified Bank Auction Property'));
    if ($rawTitle === '') {
        $rawTitle = 'Verified Bank Auction Property';
    }

    $propType = (string)($raw['property_type'] ?? $raw['category'] ?? 'Residential');
    $refNo = trim((string)($raw['property_reference_no'] ?? $raw['auction_reference_no'] ?? $raw['reference_no'] ?? ''));

    $bankName = trim((string)($raw['bank_name'] ?? ''));
    if ($bankName === '' && !empty($raw['bank']['name'])) {
        $bankName = trim((string)$raw['bank']['name']);
    }
    if ($bankName === '') {
        $bankName = trim((string)($raw['authority'] ?? 'Verified Bank Mandate'));
    }

    $city = is_array($raw['city'] ?? null) ? (string)($raw['city']['name'] ?? $raw['city']['title'] ?? '') : (string)($raw['city'] ?? '');
    $state = is_array($raw['state'] ?? null) ? (string)($raw['state']['name'] ?? $raw['state']['title'] ?? '') : (string)($raw['state'] ?? '');
    $locality = (string)($raw['area_name'] ?? $raw['locality'] ?? $raw['area'] ?? '');
    $locParts = array_values(array_unique(array_filter(array_map('trim', [$locality, $city, $state]))));
    $locationText = !empty($locParts) ? implode(', ', $locParts) : 'India';

    // Registered Address from API
    $registeredAddress = am_sanitize_text((string)($raw['address'] ?? $raw['property_address'] ?? $raw['registered_address'] ?? ''));
    if ($registeredAddress === '') {
        $registeredAddress = $locationText;
    }

    // Canonical URL WITHOUT /property/ prefix
    $slug = trim((string)($raw['slug'] ?? ''));
    if ($slug === '') {
        $titleSlug = am_to_slug($rawTitle);
        $slug = $preferredSlug !== '' ? $preferredSlug : ($titleSlug !== '' ? "{$titleSlug}-{$id}" : $id);
    }
    $cleanSlug = ltrim($slug, '/');
    $propertyUrl = rtrim($baseUrl, '/') . '/' . str_replace('%2F', '/', rawurlencode($cleanSlug));

    // Title + Registered Address for LinkedIn & all social platforms
    $ogTitle = am_format_title_with_address($rawTitle, $registeredAddress);
    $pageTitle = $refNo !== ''
        ? "{$ogTitle} (Ref: {$refNo}) | {$bankName} Auction | Auctions & More"
        : "{$ogTitle} | {$bankName} Auction | Auctions & More";

    $description = $registeredAddress !== '' ? "{$registeredAddress} | {$propertyUrl}" : $propertyUrl;

    // Image resolution: Sort images[] by sort_order ascending, fallback to category 1200x630 JPEG
    $fallbackImg = am_get_fallback_image($propType);
    $imageUrl = $fallbackImg;

    if (!empty($raw['images']) && is_array($raw['images'])) {
        $imgs = $raw['images'];
        usort($imgs, static function ($a, $b): int {
            $sa = (int)(is_array($a) ? ($a['sort_order'] ?? 0) : 0);
            $sb = (int)(is_array($b) ? ($b['sort_order'] ?? 0) : 0);
            return $sa <=> $sb;
        });
        foreach ($imgs as $imgItem) {
            $resolved = am_resolve_media_url($imgItem, '');
            if ($resolved !== '') {
                $imageUrl = $resolved;
                break;
            }
        }
    } else {
        $singleRaw = $raw['image_url'] ?? $raw['cover_image'] ?? $raw['image'] ?? null;
        $resolved = am_resolve_media_url($singleRaw, '');
        if ($resolved !== '') {
            $imageUrl = $resolved;
        }
    }

    return [
        'title'                    => $pageTitle,
        'ogTitle'                  => $ogTitle,
        'description'              => $description,
        'includeSocialDescription' => true,
        'imageUrl'                 => $imageUrl,
        'imageType'                => am_infer_mime_type($imageUrl),
        'url'                      => $propertyUrl,
        'type'                     => 'article',
        'siteName'                 => AM_SITE_NAME,
        'jsonLd'                   => [
            '@context'   => 'https://schema.org',
            '@type'      => 'RealEstateListing',
            'name'       => $ogTitle,
            'description'=> $description,
            'url'        => $propertyUrl,
            'image'      => $imageUrl,
            'identifier' => $id,
        ],
    ];
}

function am_build_authority_property_meta(array $raw, string $baseUrl, string $param): array {
    $id = (string)($raw['id'] ?? $param);
    $authorityName = trim((string)($raw['authority']['name'] ?? 'Development Authority'));
    $rawTitle = am_sanitize_text((string)($raw['title'] ?? "{$authorityName} Property"));
    if ($rawTitle === '') {
        $rawTitle = "{$authorityName} Property";
    }

    $locationText = implode(', ', array_filter([
        trim((string)($raw['city_name'] ?? '')),
        trim((string)($raw['state_name'] ?? '')),
    ])) ?: 'India';
    $registeredAddress = am_sanitize_text((string)($raw['address'] ?? ''));
    if ($registeredAddress === '') {
        $registeredAddress = implode(', ', array_filter([
            trim((string)($raw['scheme_name'] ?? '')),
            trim((string)($raw['sector'] ?? '')),
            trim((string)($raw['locality'] ?? '')),
            trim((string)($raw['city_name'] ?? '')),
            trim((string)($raw['state_name'] ?? '')),
        ])) ?: $locationText;
    }

    $imageUrl = AM_DEFAULT_IMAGE;
    if (!empty($raw['primary_image'])) {
        $imageUrl = am_resolve_media_url($raw['primary_image'], AM_DEFAULT_IMAGE);
    } elseif (!empty($raw['images'][0])) {
        $imageUrl = am_resolve_media_url($raw['images'][0], AM_DEFAULT_IMAGE);
    }

    $titleSlug = am_to_slug($rawTitle);
    $slug = $titleSlug !== '' ? "{$titleSlug}-{$id}" : $id;
    $pageUrl = rtrim($baseUrl, '/') . '/authority-properties/' . rawurlencode($slug);

    $ogTitle = am_format_title_with_address($rawTitle, $registeredAddress);
    $description = $registeredAddress !== '' ? "{$registeredAddress} | {$pageUrl}" : $pageUrl;

    return [
        'title'                    => "{$ogTitle} | {$authorityName} | Auctions & More",
        'ogTitle'                  => $ogTitle,
        'description'              => $description,
        'includeSocialDescription' => true,
        'imageUrl'                 => $imageUrl,
        'imageType'                => am_infer_mime_type($imageUrl),
        'url'                      => $pageUrl,
        'type'                     => 'article',
        'siteName'                 => AM_SITE_NAME,
        'jsonLd'                   => [
            '@context' => 'https://schema.org',
            '@type'    => 'RealEstateListing',
            'name'     => $ogTitle,
            'url'      => $pageUrl,
            'image'    => $imageUrl,
        ],
    ];
}

function am_build_auction_asset_meta(array $raw, string $baseUrl, string $param): array {
    $id = (string)($raw['id'] ?? $param);
    $category = trim((string)($raw['category'] ?? 'Industrial Asset'));
    $rawTitle = am_sanitize_text((string)($raw['title'] ?? "{$category} Auction"));
    if ($rawTitle === '') {
        $rawTitle = "{$category} Auction";
    }

    $locationText = implode(', ', array_filter([
        trim((string)($raw['city'] ?? '')),
        trim((string)($raw['state'] ?? '')),
    ])) ?: 'India';
    $registeredAddress = am_sanitize_text((string)($raw['complete_address'] ?? $raw['detail_address'] ?? $raw['plant_address'] ?? ''));
    if ($registeredAddress === '') {
        $registeredAddress = $locationText;
    }

    $rawImg = $raw['image_path'] ?? $raw['image_url'] ?? $raw['image'] ?? null;
    $imageUrl = am_resolve_media_url($rawImg, AM_INDUSTRIAL_IMAGE);

    $titleSlug = am_to_slug($rawTitle);
    $slug = $titleSlug !== '' ? "{$titleSlug}-{$id}" : $id;
    $pageUrl = rtrim($baseUrl, '/') . '/auction-asset/' . rawurlencode($slug);

    $ogTitle = am_format_title_with_address($rawTitle, $registeredAddress);
    $description = $registeredAddress !== '' ? "{$registeredAddress} | {$pageUrl}" : $pageUrl;

    return [
        'title'                    => "{$ogTitle} | {$category} Auction | Auctions & More",
        'ogTitle'                  => $ogTitle,
        'description'              => $description,
        'includeSocialDescription' => true,
        'imageUrl'                 => $imageUrl,
        'imageType'                => am_infer_mime_type($imageUrl),
        'url'                      => $pageUrl,
        'type'                     => 'product',
        'siteName'                 => AM_SITE_NAME,
        'jsonLd'                   => [
            '@context' => 'https://schema.org',
            '@type'    => 'Product',
            'name'     => $ogTitle,
            'url'      => $pageUrl,
            'image'    => $imageUrl,
        ],
    ];
}

function am_build_blog_meta(array $raw, string $baseUrl, string $param): array {
    $slug = trim((string)($raw['slug'] ?? $raw['id'] ?? $param));
    $rawTitle = am_sanitize_text((string)($raw['title'] ?? 'Bank Auction Insights & Guide'));
    if ($rawTitle === '') {
        $rawTitle = 'Bank Auction Insights & Guide';
    }
    $pageTitle = trim((string)($raw['seo_title'] ?? '')) ?: "{$rawTitle} | Auctions & More Advisory";
    $description = am_sanitize_text((string)($raw['seo_description'] ?? $raw['excerpt'] ?? '')) ?:
        'Read expert advisory insights, SARFAESI procedures, and bank auction intelligence on Auctions & More.';

    $rawImg = $raw['cover_image'] ?? (is_string($raw['image'] ?? null) ? $raw['image'] : null);
    $imageUrl = am_resolve_media_url($rawImg, AM_DEFAULT_IMAGE);
    $pageUrl = rtrim($baseUrl, '/') . '/blog/' . rawurlencode($slug);

    return [
        'title'       => $pageTitle,
        'ogTitle'     => $rawTitle,
        'description' => $description,
        'imageUrl'    => $imageUrl,
        'imageType'   => am_infer_mime_type($imageUrl),
        'url'         => $pageUrl,
        'type'        => 'article',
        'siteName'    => AM_SITE_NAME,
        'jsonLd'      => [
            '@context' => 'https://schema.org',
            '@type'    => 'Article',
            'headline' => $rawTitle,
            'url'      => $pageUrl,
            'image'    => $imageUrl,
        ],
    ];
}

function am_build_static_page_meta(string $routeKey, string $canonicalPath, string $baseUrl): array {
    $cleanBase = rtrim($baseUrl, '/');
    $pageUrl = $canonicalPath === '/' ? "{$cleanBase}/" : "{$cleanBase}{$canonicalPath}";

    $pages = [
        'home' => [
            'title' => "Auctions & More — India's Premier Distressed Asset Platform",
            'desc'  => "India's premier distressed asset and bank auction platform at auctionsandmore.in. Explore SARFAESI, IBC and DRT properties with live bidding updates, deadline alerts, and tailored investor matching.",
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'about' => [
            'title' => 'About Auctions & More — Mandate Advisory & Distressed Asset Specialists',
            'desc'  => 'Learn about Auctions & More Pvt Ltd, our institutional mandate expertise, legal due diligence, and distressed asset advisory across India.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'property' => [
            'title' => 'Verified Bank Auction Properties Across India | Auctions & More',
            'desc'  => 'Browse verified SARFAESI, IBC, and DRT bank auction properties across residential, commercial, and industrial categories.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'authority-properties' => [
            'title' => 'Government & Development Authority Properties | Auctions & More',
            'desc'  => 'Explore DDA, YEIDA, HUDA, UPSIDA and statutory development authority auction properties.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'authority-wise-properties' => [
            'title' => 'Authority-Wise Property Directory | Auctions & More',
            'desc'  => 'Filter and browse verified government authority properties organized by statutory development authority.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'scrap-auctions' => [
            'title' => 'Industrial Scrap Auctions & Material Lots | Auctions & More',
            'desc'  => 'Verified ferrous, non-ferrous, e-waste, and industrial scrap auction lots across India.',
            'img'   => AM_INDUSTRIAL_IMAGE,
        ],
        'plant-machinery-auctions' => [
            'title' => 'Plant & Machinery Auctions | Auctions & More',
            'desc'  => 'Verified industrial plant, manufacturing machinery, and equipment liquidation auctions.',
            'img'   => AM_INDUSTRIAL_IMAGE,
        ],
        'auction-management' => [
            'title' => 'Industrial Auction Asset Management Desk | Auctions & More',
            'desc'  => 'Manage institutional scrap and plant & machinery auction assets on Auctions & More.',
            'img'   => AM_INDUSTRIAL_IMAGE,
        ],
        'blogs' => [
            'title' => 'Bank Auction Insights, SARFAESI Guides & Advisory | Auctions & More',
            'desc'  => 'Read legal guides, SARFAESI Act insights, bidding strategies, and auction market updates.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'faq' => [
            'title' => 'Frequently Asked Questions — Bank Auction Guide | Auctions & More',
            'desc'  => 'Answers to common questions about EMD deposits, e-auction bidding, possession, and title clearance.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'contact' => [
            'title' => 'Contact Auctions & More — Investor Advisory & Helpdesk',
            'desc'  => 'Reach out to our auction advisory desk for site inspections, EMD support, and mandate inquiries.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'privacy' => [
            'title' => 'Privacy Policy | Auctions & More',
            'desc'  => 'Privacy Policy and data protection practices at Auctions & More.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'terms' => [
            'title' => 'Terms & Conditions | Auctions & More',
            'desc'  => 'Terms and Conditions governing platform access and auction advisory services.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
        'not-found' => [
            'title' => 'Page Not Found | Auctions & More',
            'desc'  => 'The requested page could not be found on Auctions & More.',
            'img'   => AM_DEFAULT_IMAGE,
        ],
    ];

    $cfg = $pages[$routeKey] ?? $pages['home'];

    return [
        'title'       => $cfg['title'],
        'ogTitle'     => $cfg['title'],
        'description' => $cfg['desc'],
        'imageUrl'    => $cfg['img'],
        'imageType'   => am_infer_mime_type($cfg['img']),
        'url'         => $pageUrl,
        'type'        => 'website',
        'siteName'    => AM_SITE_NAME,
        'jsonLd'      => [
            '@context' => 'https://schema.org',
            '@type'    => ($routeKey === 'home' ? 'WebSite' : 'WebPage'),
            'name'     => $cfg['title'],
            'url'      => $pageUrl,
        ],
    ];
}

function am_resolve_metadata(string $rawPath, string $baseUrl): array {
    $pathOnly = explode('?', $rawPath, 2)[0];
    $noHash = explode('#', $pathOnly, 2)[0];
    $decoded = rawurldecode($noHash);
    $cleanPath = strlen($decoded) > 1 ? rtrim($decoded, '/') : ($decoded ?: '/');
    if ($cleanPath === '') {
        $cleanPath = '/';
    }
    $lowerPath = strtolower($cleanPath);

    // Homepage / Root
    if ($cleanPath === '/' || $lowerPath === '/home') {
        return am_build_static_page_meta('home', '/', $baseUrl);
    }

    // Known dedicated pages
    $staticRouteMap = [
        '/about'                        => 'about',
        '/about-us'                     => 'about',
        '/properties'                   => 'property',
        '/property'                     => 'property',
        '/auctions'                     => 'property',
        '/authority-properties'         => 'authority-properties',
        '/authority-properties/authority'=> 'authority-wise-properties',
        '/scrap-auctions'               => 'scrap-auctions',
        '/scrap-auction'                => 'scrap-auctions',
        '/scrap'                        => 'scrap-auctions',
        '/plant-machinery-auctions'     => 'plant-machinery-auctions',
        '/plant-and-machinery-auctions' => 'plant-machinery-auctions',
        '/plant-machinery'              => 'plant-machinery-auctions',
        '/machinery-auctions'           => 'plant-machinery-auctions',
        '/auction-management'           => 'auction-management',
        '/manage-auctions'              => 'auction-management',
        '/blogs'                        => 'blogs',
        '/blog'                         => 'blogs',
        '/insights'                     => 'blogs',
        '/faq'                          => 'faq',
        '/faqs'                         => 'faq',
        '/contact'                      => 'contact',
        '/contact-us'                   => 'contact',
        '/privacy'                      => 'privacy',
        '/privacy-policy'               => 'privacy',
        '/terms'                        => 'terms',
        '/terms-conditions'             => 'terms',
        '/terms-and-conditions'         => 'terms',
        '/404'                          => 'not-found',
    ];

    if (isset($staticRouteMap[$lowerPath])) {
        $routeKey = $staticRouteMap[$lowerPath];
        return am_build_static_page_meta($routeKey, $cleanPath, $baseUrl);
    }

    if (strpos($lowerPath, '/authority-properties/authority/') === 0) {
        return am_build_static_page_meta('authority-wise-properties', $cleanPath, $baseUrl);
    }

    // Legacy /property/:slug or /properties/:slug
    if (strpos($lowerPath, '/property/') === 0 || strpos($lowerPath, '/properties/') === 0) {
        $prefixLen = strpos($lowerPath, '/property/') === 0 ? 10 : 12;
        $param = trim(substr($cleanPath, $prefixLen), '/');
        if ($param !== '') {
            $rawProp = am_fetch_property($param);
            if ($rawProp !== null) {
                return am_build_property_meta($rawProp, $baseUrl, $param);
            }
            return am_build_property_meta(['id' => $param, 'title' => "Auction Property #{$param}"], $baseUrl, $param);
        }
    }

    // Authority Property Detail: /authority-properties/:slugOrId
    if (strpos($lowerPath, '/authority-properties/') === 0) {
        $param = trim(substr($cleanPath, 22), '/');
        if ($param !== '') {
            $numericId = am_extract_entity_id($param) ?: $param;
            $json = am_http_get_json(AM_API_BASE . '/authority-properties/' . rawurlencode($numericId));
            $data = (isset($json['data']) && is_array($json['data'])) ? $json['data'] : $json;
            if (is_array($data) && (!empty($data['id']) || !empty($data['title']))) {
                return am_build_authority_property_meta($data, $baseUrl, $param);
            }
            return am_build_authority_property_meta(['id' => $numericId, 'title' => "Authority Property #{$param}"], $baseUrl, $param);
        }
    }

    // Auction Asset Detail: /auction-asset/:id or /auction/:id
    if (strpos($lowerPath, '/auction-asset/') === 0 || strpos($lowerPath, '/auction/') === 0) {
        $prefixLen = strpos($lowerPath, '/auction-asset/') === 0 ? 15 : 9;
        $param = trim(substr($cleanPath, $prefixLen), '/');
        if ($param !== '') {
            $numericId = am_extract_entity_id($param) ?: $param;
            $json = am_http_get_json(AM_API_BASE . '/auction-assets/' . rawurlencode($numericId));
            $data = (isset($json['data']) && is_array($json['data'])) ? $json['data'] : $json;
            if (is_array($data) && (!empty($data['id']) || !empty($data['title']))) {
                return am_build_auction_asset_meta($data, $baseUrl, $param);
            }
            return am_build_auction_asset_meta(['id' => $numericId, 'title' => "Auction Asset #{$param}"], $baseUrl, $param);
        }
    }

    // Blog Detail: /blog/:slug
    if (strpos($lowerPath, '/blog/') === 0) {
        $param = trim(substr($cleanPath, 6), '/');
        if ($param !== '') {
            $json = am_http_get_json(AM_API_BASE . '/blogs/' . rawurlencode($param));
            $data = (isset($json['data']) && is_array($json['data'])) ? $json['data'] : $json;
            if (is_array($data) && (!empty($data['id']) || !empty($data['title']))) {
                return am_build_blog_meta($data, $baseUrl, $param);
            }
        }
    }

    // Root-level Bank Auction Property Slug Route: /:slug (without /property/ prefix)
    $rootSlug = ltrim($cleanPath, '/');
    if ($rootSlug !== '' && strpos($rootSlug, '/') === false && strpos($rootSlug, '.') === false && strtolower($rootSlug) !== 'api') {
        $rawProp = am_fetch_property($rootSlug);
        if ($rawProp !== null) {
            return am_build_property_meta($rawProp, $baseUrl, $rootSlug);
        }
        return am_build_static_page_meta('not-found', '/404', $baseUrl);
    }

    return am_build_static_page_meta('home', '/', $baseUrl);
}

function am_render_head_tags(array $meta): string {
    $title     = am_escape_html((string)$meta['title']);
    $ogTitle   = am_escape_html((string)$meta['ogTitle']);
    $url       = am_escape_html((string)$meta['url']);
    $imageUrl  = am_escape_html((string)$meta['imageUrl']);
    $imageType = am_escape_html((string)$meta['imageType']);
    $type      = am_escape_html((string)$meta['type']);
    $siteName  = am_escape_html((string)$meta['siteName']);
    $includeDesc = !empty($meta['includeSocialDescription']) && !empty($meta['description']);
    $descEsc   = $includeDesc ? am_escape_html((string)$meta['description']) : '';
    $metaDescTag    = $includeDesc ? "    <meta name=\"description\" content=\"{$descEsc}\" />\n" : '';
    $ogDescTag      = $includeDesc ? "    <meta property=\"og:description\" content=\"{$descEsc}\" />\n" : '';
    $twitterDescTag = $includeDesc ? "    <meta name=\"twitter:description\" content=\"{$descEsc}\" />\n" : '';
    $jsonLd    = json_encode($meta['jsonLd'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

    return <<<HTML
    <title>{$title}</title>
{$metaDescTag}    <link rel="canonical" href="{$url}" />

    <!-- Open Graph / LinkedIn / Facebook / WhatsApp -->
    <meta property="og:type" content="{$type}" />
    <meta property="og:site_name" content="{$siteName}" />
    <meta property="og:title" content="{$ogTitle}" />
{$ogDescTag}    <meta property="og:url" content="{$url}" />
    <meta property="og:image" content="{$imageUrl}" />
    <meta property="og:image:secure_url" content="{$imageUrl}" />
    <meta property="og:image:type" content="{$imageType}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="{$ogTitle}" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{$ogTitle}" />
{$twitterDescTag}    <meta name="twitter:image" content="{$imageUrl}" />
    <meta name="twitter:url" content="{$url}" />

    <!-- Dynamic Schema.org JSON-LD -->
    <script type="application/ld+json" data-dynamic-seo="true">
{$jsonLd}
    </script>
HTML;
}

function am_inject_head_tags(string $html, string $headTags): string {
    $cleaned = preg_replace([
        '#<title>.*?</title>#is',
        '#<meta\s+name=["\']description["\'][^>]*>#is',
        '#<link\s+rel=["\']canonical["\'][^>]*>#is',
        '#<meta\s+property=["\']og:[^"\']+["\'][^>]*>#is',
        '#<meta\s+name=["\']twitter:[^"\']+["\'][^>]*>#is',
        '#<script\s+type=["\']application/ld\+json["\'][^>]*>.*?</script>#is',
    ], '', $html);

    if (!is_string($cleaned)) {
        $cleaned = $html;
    }

    if (stripos($cleaned, '<head>') !== false) {
        return preg_replace('/<head>/i', "<head>\n" . $headTags, $cleaned, 1) ?? ($headTags . "\n" . $cleaned);
    }

    return $headTags . "\n" . $cleaned;
}

// -----------------------------------------------------------------------------
// Main Entrypoint
// -----------------------------------------------------------------------------
$indexPath = __DIR__ . '/index.html';
$rawHtml = is_file($indexPath) ? @file_get_contents($indexPath) : false;

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('Vary: User-Agent');

if ($rawHtml === false) {
    $rawHtml = "<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\" /></head><body></body></html>";
}

try {
    $rawHost = (string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'auctionsandmore.in');
    $host = trim(explode(',', $rawHost)[0]);
    if ((stripos($host, 'auctionsandmore.in') !== false || stripos($host, 'auctionandmore.in') !== false) && stripos($host, 'admin.') !== 0) {
        $baseUrl = AM_OFFICIAL_URL;
    } else {
        $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $baseUrl = $host !== '' ? "{$proto}://{$host}" : AM_OFFICIAL_URL;
    }

    $requestUri = (string)($_SERVER['REQUEST_URI'] ?? '/');
    $meta = am_resolve_metadata($requestUri, $baseUrl);
    $headTags = am_render_head_tags($meta);
    echo am_inject_head_tags($rawHtml, $headTags);
} catch (\Throwable $e) {
    echo $rawHtml;
}
