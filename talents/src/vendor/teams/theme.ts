import { theme as antdTheme, type ThemeConfig } from 'antd'

/** Chrys brand purple (sampled from the UI screen) */
export const chrysPurple = '#9470c4'
/** Dark theme primary purple: taken from the Chrys TUI theme primary (chrys/app/tui/theme.py); a brighter purple keeps contrast on dark backgrounds */
export const chrysPurpleDark = '#af87ff'

export type UiThemeMode = 'light' | 'dark'

export function teamsTheme(mode: UiThemeMode): ThemeConfig {
  const primary = mode === 'dark' ? chrysPurpleDark : chrysPurple
  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    components: { Segmented: { itemSelectedBg: mode === 'dark' ? '#3e374d' : '#f0eaf9', itemSelectedColor: primary }, Tabs: { horizontalMargin: '0 0 8px 0', horizontalItemPadding: '8px 0' } },
    token: {
      colorPrimary: primary,
      colorInfo: primary,
      colorLink: primary,
      borderRadius: 9,
      fontSize: 14,
      ...(mode === 'dark' ? { colorBgContainer: '#262626', colorBgElevated: '#262626', colorBgLayout: '#1c1c1c', colorText: '#eeeeee', colorBorder: '#44444c', colorPrimaryBg: '#3e374d' } : {}),
    },
  }
}
