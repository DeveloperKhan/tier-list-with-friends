import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ja from './ja.json';
import es from './es.json';
import pt from './pt.json';
import zh from './zh.json';
import vi from './vi.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
      es: { translation: es },
      pt: { translation: pt },
      zh: { translation: zh },
      vi: { translation: vi },
    },
    lng: localStorage.getItem('language') ?? 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
