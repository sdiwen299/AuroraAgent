import { theme as antdAlgorithms, type ThemeConfig } from 'antd';

const sharedFont =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';

const sharedToken = {
  // 登录页视觉语言：橄榄绿主色 + 烧橙动作色
  colorPrimary: '#20340f',
  colorSuccess: '#2f6b1e',
  colorWarning: '#b45309',
  colorError: '#b3261e',
  colorInfo: '#0f6f5f',
  borderRadius: 12,
  fontFamily: sharedFont,
  fontSize: 14,
};

export const lightTheme: ThemeConfig = {
  algorithm: antdAlgorithms.defaultAlgorithm,
  token: {
    ...sharedToken,
    colorBgLayout: '#f8f1de',
    colorBgContainer: '#fffdf6',
    colorBorder: '#e4d9bd',
    colorText: '#0e0803',
    colorTextSecondary: '#61635f',
    colorTextTertiary: '#61635f',
    colorTextHeading: '#0e0803',
    colorBorderSecondary: '#e4d9bd',
    colorLink: '#16260a',
    colorLinkHover: '#9f3410',
    boxShadow: '0 2px 10px rgba(38,28,10,0.09)',
    boxShadowSecondary: '0 10px 30px rgba(38,28,10,0.16)',
  },
  components: {
    Button: {
      primaryColor: '#ffffff',
      primaryShadow: '0 4px 12px rgba(32,52,15,0.28)',
      fontWeight: 600,
      controlHeight: 36,
      borderRadius: 8,
    },
    Input: { controlHeight: 36, borderRadius: 8 },
    InputNumber: { controlHeight: 36, borderRadius: 8 },
    Select: { controlHeight: 36, borderRadius: 8 },
    Tag: { borderRadiusSM: 8 },
    Alert: { borderRadiusLG: 8 },
    Card: { borderRadiusLG: 14, headerBg: 'transparent' },
    Modal: { borderRadiusLG: 16 },
    Segmented: { borderRadius: 10 },
    Layout: { bodyBg: '#f8f1de', headerBg: '#f8f1de', siderBg: '#fffdf6' },
    Table: { headerBg: '#f3ebd6', headerColor: '#0e0803', borderColor: '#e4d9bd' },
    Tabs: { itemSelectedColor: '#20340f', inkBarColor: '#20340f' },
  },
};
