/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#020A10',
          surface: '#0A1620',
          darkgray: '#050D14',
          primary: '#E8B84A',
          primaryHover: '#C99A2E',
          accent: '#F0D078',
          success: '#4ADE80',
          textPrimary: '#F8FAFC',
          textSecondary: '#94A3B8',
          gray: {
            300: '#CBD5E1',
            500: '#64748B',
            600: '#475569'
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
        pulse: 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        marquee: 'marquee 40s linear infinite'
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(340%)' }
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' }
        }
      },
      maxWidth: {
        content: '1200px'
      }
    }
  }
};
