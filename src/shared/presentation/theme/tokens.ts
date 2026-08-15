export const tokens = {
  colors: {
    chrome: '#0D1B2A',
    background: '#F4F6F8',
    surface: '#FFFFFF',
    primary: '#1565C0',
    primaryPressed: '#0D47A1',
    primaryDisabled: '#6B7785',
    text: '#111827',
    textMuted: '#526170',
    textInverse: '#FFFFFF',
    border: '#526170',
    status: {
      neutral: {
        background: '#E3E8EE',
        border: '#657383',
        text: '#1E2A36',
      },
      info: {
        background: '#DDEEFF',
        border: '#1565C0',
        text: '#0B3B70',
      },
      success: {
        background: '#DDF2E1',
        border: '#2E7D32',
        text: '#1B5E20',
      },
      warning: {
        background: '#FFF0C2',
        border: '#A15C00',
        text: '#6D3E00',
      },
      danger: {
        background: '#F9DEDE',
        border: '#B71C1C',
        text: '#7F1212',
      },
    },
  },
  typography: {
    title: {
      fontFamily: 'sans-serif',
      fontSize: 28,
      fontWeight: '700',
      lineHeight: 34,
    },
    body: {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
    },
    action: {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.3,
      lineHeight: 20,
    },
    label: {
      fontFamily: 'monospace',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.2,
      lineHeight: 16,
      textTransform: 'uppercase',
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borders: {
    width: {
      thin: 1,
      strong: 2,
    },
    radius: {
      none: 0,
      subtle: 2,
    },
  },
} as const;

export type StatusTone = keyof typeof tokens.colors.status;
