export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0a1630', 900: '#0f1f3d', 800: '#17294d', 700: '#233a66', 600: '#34507f' },
        signal: { DEFAULT: '#2f6fed', dark: '#2358c4' },
        mist: '#f3f5f9',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
