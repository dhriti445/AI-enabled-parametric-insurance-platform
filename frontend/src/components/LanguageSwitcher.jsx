import { useEffect, useState } from 'react';
import { LANGUAGES, getLanguage, setLanguage } from '../lib/i18n';

export default function LanguageSwitcher({ dark = false }) {
  const [current, setCurrent] = useState(getLanguage());

  useEffect(() => {
    const handler = () => setCurrent(getLanguage());
    window.addEventListener('languagechange', handler);
    return () => window.removeEventListener('languagechange', handler);
  }, []);

  const handleSelect = (code) => { setLanguage(code); setCurrent(code); };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {LANGUAGES.map((lang) => {
        const isActive = current === lang.code;
        if (dark) {
          return (
            <button key={lang.code} onClick={() => handleSelect(lang.code)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                isActive ? 'text-emerald-900' : 'text-emerald-300/60 hover:text-emerald-200'
              }`}
              style={isActive ? { background: '#6ee7b7' } : { background: 'rgba(255,255,255,0.07)' }}>
              {lang.label}
            </button>
          );
        }
        return (
          <button key={lang.code} onClick={() => handleSelect(lang.code)}
            style={isActive ? { backgroundColor: '#1f8f86', color: '#fff' } : {}}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              isActive ? 'ring-2 ring-offset-1' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}
