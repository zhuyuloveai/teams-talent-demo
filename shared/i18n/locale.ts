export type Locale = 'zh' | 'en';
export const locales: readonly Locale[] = ['zh', 'en'];
export const defaultLocale: Locale = 'en';
export const localeStorageKey = 'demo-locale';

export const isLocale = (value: unknown): value is Locale => value === 'zh' || value === 'en';
/** BCP 47 tag for Intl and <html lang>. */
export const htmlLang = (locale: Locale): string => (locale === 'zh' ? 'zh-CN' : 'en');

/** `?lang=` wins so a link can pin a language; otherwise remembered, then default. The English demo
 *  ignores the browser language so a presenter's Chinese system still opens in English. */
export function detectLocale(fallback: Locale = defaultLocale): Locale {
  if (typeof window === 'undefined') return fallback;
  const requested = new URLSearchParams(window.location.search).get('lang');
  if (isLocale(requested)) return requested;
  const remembered = window.localStorage.getItem(localeStorageKey);
  if (isLocale(remembered)) return remembered;
  return fallback;
}

export function rememberLocale(locale: Locale): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(localeStorageKey, locale);
}

// Ambient locale for non-React modules (task projections, vendor templates). The provider
// writes it before rendering, so plain functions called during render read the same value.
let current: Locale = defaultLocale;
export const setCurrentLocale = (locale: Locale): void => { current = locale; };
export const currentLocale = (): Locale => current;
