import baseConfig from '@thinktank/ui-library/tailwind.config'
import type { Config } from 'tailwindcss'

export default {
  ...baseConfig,
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui-library/src/**/*.{js,ts,jsx,tsx}',
  ],
} satisfies Config
