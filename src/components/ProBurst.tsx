import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import LottieView from 'lottie-react-native';

type Props = {
  visible: boolean;
  zIndex?: number; // NEW
};

const { width, height } = Dimensions.get('window');
const SIZE = Math.min(width, height) * 0.95;

export default function ProBurst({ visible, zIndex = 99 }: Props) {
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setPlayKey((k) => k + 1);
  }, [visible]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { zIndex }]}>
      <LottieView
        key={`pro-burst-${playKey}`}
        source={require('../assets/lottie/pro-burst.json')}
        loop={false}
        autoPlay
        renderMode="HARDWARE"
        style={{ width: SIZE, height: SIZE, opacity: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 99 },
    }),
  },
});
