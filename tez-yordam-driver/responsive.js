import { Dimensions, Platform, PixelRatio, StatusBar } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base design was made on iPhone 14 (390px wide)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

// Scale factor
const widthScale = SCREEN_WIDTH / BASE_WIDTH;
const heightScale = SCREEN_HEIGHT / BASE_HEIGHT;
const scale = Math.min(widthScale, heightScale);

// Scale a size proportionally to screen
export const rs = (size) => Math.round(PixelRatio.roundToNearestPixel(size * scale));

// Scale font size
export const rf = (size) => {
  const newSize = size * scale;
  if (Platform.OS === 'ios') return Math.round(PixelRatio.roundToNearestPixel(newSize));
  return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2; // Android fonts render slightly larger
};

// Platform helpers
export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';

// Status bar height
export const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;

// Screen dimensions
export const SCREEN = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

// Safe padding for bottom (home indicator on iPhone, nothing on Android)
export const BOTTOM_SAFE = isIOS ? 34 : 16;

// Common shadow that works on both platforms
export const shadow = (elevation = 4) => ({
  ...Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: elevation / 2 },
      shadowOpacity: 0.15,
      shadowRadius: elevation,
    },
    android: {
      elevation,
    },
  }),
});
