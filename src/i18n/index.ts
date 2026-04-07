import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import ta from './ta'
import hi from './hi'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ta: { translation: ta },
    hi: { translation: hi },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
