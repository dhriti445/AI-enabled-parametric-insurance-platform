import { useEffect, useState } from 'react';
import { getLanguage, t as translate } from './i18n';

/**
 * Hook that returns a translation function `t` and forces re-render on language change.
 * NOTE: `t` must NOT be memoized — it needs to be a fresh function each render so
 * components pick up the new language after the state update.
 */
export function useTranslation() {
  const [lang, setLang] = useState(getLanguage());

  useEffect(() => {
    const handler = () => setLang(getLanguage());
    window.addEventListener('languagechange', handler);
    return () => window.removeEventListener('languagechange', handler);
  }, []);

  // Fresh function every render — reads current lang from closure
  const t = (key) => translate(key);

  return { t, lang };
}
