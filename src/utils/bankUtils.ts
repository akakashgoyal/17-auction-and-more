import { Property } from '../types';
import { BankItem, resolvePropertyImageUrl } from '../services/api';

export interface ResolvedBankInfo {
  bank: BankItem | null;
  logoUrl: string | null;
  displayName: string;
}

function normalizeText(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\bfinanace\b/g, 'finance');
}

function compactAlnum(input: string): string {
  return normalizeText(input).replace(/[^a-z0-9&]/g, '');
}

function stripTrailingCorporateWords(input: string): string {
  let current = normalizeText(input)
    .replace(/[.,]+$/g, '')
    .trim();

  const suffixPattern = /\s+(?:limited|ltd|private|pvt|company|co|bank|inc)$/i;
  for (let i = 0; i < 4; i++) {
    const next = current.replace(suffixPattern, '').replace(/[.,]+$/g, '').trim();
    if (!next || next === current || next.length < 3) {
      break;
    }
    current = next;
  }
  return current;
}

function resolveLogoString(rawLogo?: string | null): string | null {
  if (!rawLogo || typeof rawLogo !== 'string') return null;
  const trimmed = rawLogo.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const resolved = resolvePropertyImageUrl(trimmed);
  return resolved || null;
}

export interface BankMatchFields {
  bankName?: string | null;
  bankId?: number | string | null;
  bankLogo?: string | null;
}

/**
 * Resolves the matching bank record and logo URL from raw bank fields against existing database banks.
 * Avoids false-positive substring matches (e.g., "State Bank of India" matching "Bank of India",
 * or "PNB Housing Finance" matching "PNB").
 */
export function resolveMatchedBankByFields(
  fields: BankMatchFields | null | undefined,
  banks: BankItem[]
): ResolvedBankInfo {
  if (!fields) {
    return { bank: null, logoUrl: null, displayName: '' };
  }

  const rawBankName = fields.bankName ? String(fields.bankName).trim() : '';
  const directLogo = resolveLogoString(fields.bankLogo || null);
  const rawBankId = fields.bankId ?? null;

  const activeBanks = (banks || []).filter((b) => Boolean(b && b.status !== false));
  const banksWithLogos = activeBanks.filter((b) => Boolean(resolveLogoString(b.logo)));
  const candidates = banksWithLogos.length > 0 ? banksWithLogos : activeBanks;

  // 1. Direct ID match
  if (rawBankId !== null && rawBankId !== undefined && String(rawBankId).trim() !== '') {
    const idMatch = candidates.find((b) => String(b.id) === String(rawBankId));
    if (idMatch) {
      return {
        bank: idMatch,
        logoUrl: directLogo || resolveLogoString(idMatch.logo),
        displayName: rawBankName || idMatch.name,
      };
    }
  }

  // If there is no bank name string to match against, return direct logo if present
  if (!rawBankName) {
    return {
      bank: null,
      logoUrl: directLogo,
      displayName: '',
    };
  }

  const propNorm = normalizeText(rawBankName);
  const propCompact = compactAlnum(rawBankName);
  const propStripped = stripTrailingCorporateWords(rawBankName);

  const matchByExactNorm = candidates.find((b) => {
    const nameNorm = normalizeText(b.name || '');
    const shortNorm = b.short_name ? normalizeText(b.short_name) : '';
    return nameNorm === propNorm || (Boolean(shortNorm) && shortNorm === propNorm);
  });

  if (matchByExactNorm) {
    return {
      bank: matchByExactNorm,
      logoUrl: directLogo || resolveLogoString(matchByExactNorm.logo),
      displayName: rawBankName,
    };
  }

  // 2. Punctuation / spacing insensitive match (e.g., "J M Financial " vs "JM Financial")
  const matchByCompact = candidates.find((b) => {
    const nameCompact = compactAlnum(b.name || '');
    const shortCompact = b.short_name ? compactAlnum(b.short_name) : '';
    return (
      (Boolean(nameCompact) && nameCompact === propCompact) ||
      (Boolean(shortCompact) && shortCompact === propCompact)
    );
  });

  if (matchByCompact) {
    return {
      bank: matchByCompact,
      logoUrl: directLogo || resolveLogoString(matchByCompact.logo),
      displayName: rawBankName,
    };
  }

  // 3. Corporate suffix-insensitive exact root match
  // e.g., "Punjab & Sind Bank" <-> "Punjab & Sind ", "Cholamandalam Investment and Finance Company" <-> "... Limited"
  const matchByStripped = candidates.find((b) => {
    const nameStripped = stripTrailingCorporateWords(b.name || '');
    const shortStripped = b.short_name ? stripTrailingCorporateWords(b.short_name) : '';
    return (
      (nameStripped.length >= 3 && nameStripped === propStripped) ||
      (shortStripped.length >= 3 && shortStripped === propStripped)
    );
  });

  if (matchByStripped) {
    return {
      bank: matchByStripped,
      logoUrl: directLogo || resolveLogoString(matchByStripped.logo),
      displayName: rawBankName,
    };
  }

  // 4. Safe word-boundary prefix match (longest bank name wins, e.g., "State Bank of India - SAMB Delhi")
  const sortedByLength = [...candidates].sort(
    (a, b) => normalizeText(b.name || '').length - normalizeText(a.name || '').length
  );

  const matchByPrefix = sortedByLength.find((b) => {
    const bankNorm = normalizeText(b.name || '');
    if (bankNorm.length < 5) return false;
    return (
      propNorm.startsWith(`${bankNorm} `) ||
      propNorm.startsWith(`${bankNorm}-`) ||
      propNorm.startsWith(`${bankNorm},`) ||
      propNorm.startsWith(`${bankNorm} (`)
    );
  });

  if (matchByPrefix) {
    return {
      bank: matchByPrefix,
      logoUrl: directLogo || resolveLogoString(matchByPrefix.logo),
      displayName: rawBankName,
    };
  }

  return {
    bank: null,
    logoUrl: directLogo,
    displayName: rawBankName,
  };
}

/**
 * Resolves the matching bank record and logo URL for a Property from existing database banks.
 */
export function resolveMatchedBank(
  property: Property | null | undefined,
  banks: BankItem[]
): ResolvedBankInfo {
  if (!property) {
    return { bank: null, logoUrl: null, displayName: '' };
  }

  const rawBankName =
    (property.bank_name && property.bank_name.trim()) ||
    (property.bankName && property.bankName.trim()) ||
    ((property.raw as any)?.bank_name && String((property.raw as any).bank_name).trim()) ||
    ((property.raw as any)?.bank?.name && String((property.raw as any).bank.name).trim()) ||
    '';

  const rawBankLogo =
    property.bankLogo ||
    (property.raw as any)?.bank_logo ||
    (property.raw as any)?.bank?.logo ||
    null;

  const rawBankId =
    property.bankId ??
    (property.raw as any)?.bank_id ??
    (property.raw as any)?.bank?.id ??
    null;

  return resolveMatchedBankByFields(
    {
      bankName: rawBankName,
      bankId: rawBankId,
      bankLogo: rawBankLogo,
    },
    banks
  );
}

