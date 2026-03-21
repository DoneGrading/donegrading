import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

const DEFAULT_LANG = 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng:
    typeof window !== 'undefined' ? localStorage.getItem('dg_lang') || DEFAULT_LANG : DEFAULT_LANG,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
