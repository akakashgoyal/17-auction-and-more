/**
 * Curated Fallback Real Estate & Property Images
 * High-resolution, professional architectural photography for bank auction properties
 * when no photographs have been uploaded or when an image fails to load.
 */

export const DEFAULT_PROPERTY_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?fit=crop&w=1200&h=630&q=80&fm=jpg';

export const PROPERTY_TYPE_FALLBACK_IMAGES: Record<string, string> = {
  Residential:
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?fit=crop&w=1200&h=630&q=80&fm=jpg',
  Commercial:
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?fit=crop&w=1200&h=630&q=80&fm=jpg',
  Industrial:
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?fit=crop&w=1200&h=630&q=80&fm=jpg',
  Land:
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?fit=crop&w=1200&h=630&q=80&fm=jpg',
  Hospitality:
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?fit=crop&w=1200&h=630&q=80&fm=jpg',
  'Mixed-Use':
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?fit=crop&w=1200&h=630&q=80&fm=jpg',
  Agricultural:
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?fit=crop&w=1200&h=630&q=80&fm=jpg',
  Institutional:
    'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?fit=crop&w=1200&h=630&q=80&fm=jpg',
  'Special Purpose':
    'https://images.unsplash.com/photo-1577495508048-b635879837f1?fit=crop&w=1200&h=630&q=80&fm=jpg',
};

/**
 * Returns a high-res contextual fallback property image based on the property type
 */
export const getPropertyFallbackImage = (propertyType?: string): string => {
  if (propertyType && PROPERTY_TYPE_FALLBACK_IMAGES[propertyType]) {
    return PROPERTY_TYPE_FALLBACK_IMAGES[propertyType];
  }
  return DEFAULT_PROPERTY_FALLBACK_IMAGE;
};
