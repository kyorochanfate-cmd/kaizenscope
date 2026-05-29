import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * カイゼンスコープ デザイントークン
 *
 * テーマ: "Industrial Premium"
 *   - 深いインディゴ × アンバー
 *   - 製造現場ツールの硬派さ × 高級感
 */

export const colors = {
  // === Primary (Indigo) ===
  primary50: '#eef2ff',
  primary100: '#e0e7ff',
  primary200: '#c7d2fe',
  primary400: '#818cf8',
  primary500: '#6366f1',
  primary600: '#4f46e5',
  primary700: '#4338ca',
  primary800: '#3730a3',
  primary900: '#312e81',

  // === Accent (Amber - 強調や CTA で控えめに) ===
  accent400: '#fbbf24',
  accent500: '#f59e0b',
  accent600: '#d97706',
  accent700: '#b45309',

  // === Status ===
  success50: '#ecfdf5',
  success500: '#10b981',
  success600: '#059669',
  success700: '#047857',

  warn50: '#fffbeb',
  warn500: '#f59e0b',
  warn600: '#d97706',
  warn700: '#b45309',

  danger50: '#fef2f2',
  danger500: '#ef4444',
  danger600: '#dc2626',
  danger700: '#b91c1c',

  info50: '#eff6ff',
  info500: '#3b82f6',
  info700: '#1d4ed8',

  // === Neutrals (slate) ===
  bg: '#f5f7fb', // メインの背景 — わずかに青味のあるクールホワイト
  bgAlt: '#eef0f6',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  border: '#e5e7eb',
  borderMuted: '#f1f5f9',

  text: '#0f172a', // slate-900
  textStrong: '#020617',
  textMuted: '#475569', // slate-600
  textDim: '#64748b', // slate-500
  textFaint: '#94a3b8', // slate-400

  // === Category (TPS) ===
  catValue: '#10b981', // 正味
  catIncidental: '#3b82f6', // 付帯
  catWaste: '#ef4444', // ムダ
} as const;

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

/** 多層シャドウ — 視覚的に「浮いている」感を強める */
export const shadows = {
  /** カードなどに使う、ほのかな浮き */
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 2 },
    default: {},
  })!,
  /** ヒーローカード等で強めに */
  cardStrong: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 6 },
    default: {},
  })!,
  /** FAB や上昇ボタン */
  floating: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#3730a3',
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 10 },
    default: {},
  })!,
  /** タブバーなど下から上に光るシャドウ */
  topbar: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: -3 },
    },
    android: { elevation: 8 },
    default: {},
  })!,
} as const;

/** タイポグラフィプリセット — 一貫した見出し階層 */
export const typography = {
  display: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textStrong,
    letterSpacing: -0.5,
  } as TextStyle,
  h1: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  } as TextStyle,
  h2: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  } as TextStyle,
  h3: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  } as TextStyle,
  body: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
  } as TextStyle,
  caption: {
    fontSize: 12,
    color: colors.textDim,
  } as TextStyle,
  micro: {
    fontSize: 10,
    color: colors.textFaint,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  } as TextStyle,
  num: {
    fontVariant: ['tabular-nums'],
  } as TextStyle,
} as const;

/** よく使うグラデーション */
export const gradients = {
  primary: [colors.primary600, colors.primary800] as const,
  primarySoft: [colors.primary500, colors.primary700] as const,
  // ヘッダーは白文字の可読性最優先。十分暗い indigo-950 → indigo-800
  header: ['#1e1b4b', '#312e81'] as const,
  hero: ['#4338ca', '#6366f1', '#8b5cf6'] as const,
  success: [colors.success500, colors.success700] as const,
  danger: [colors.danger500, colors.danger700] as const,
  surface: ['#ffffff', '#fafbff'] as const,
} as const;
