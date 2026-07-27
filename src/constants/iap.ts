import { Platform } from 'react-native';

export const COINS_SKU = Platform.select({
  ios: 'coins',
  android: 'coins',
  default: '',
})!;
