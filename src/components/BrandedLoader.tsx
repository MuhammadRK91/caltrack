// src/components/BrandedLoader.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

type Props = {
  size?: number;            // overall size
  visible?: boolean;        // keep compatibility with old prop
  backgroundColor?: string; // optional backdrop if you want
};

export default function BrandedLoader({ size = 56, visible = true }: Props) {
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [rotate, visible]);

  if (!visible) return null;

  const r = size / 2;
  const ringOuter = Math.max(2, Math.round(size * 0.045));
const ringInner = Math.max(2, Math.round(size * 0.035));
const ball = Math.max(8, Math.round(size * 0.14));

  const orbitRadius = r - ringOuter - ball / 2 - 2;

  const spin = {
    transform: [
      {
        rotate: rotate.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        }),
      },
    ],
  };

  return (
    <View style={[styles.pl, { width: size, height: size }]}>
      {/* outer ring */}
      <View
        style={[
          styles.plOuterRing,
          {
            width: size,
            height: size,
            borderRadius: r,
            borderWidth: ringOuter,
          },
        ]}
      />

      {/* inner ring */}
      <View
        style={[
          styles.plInnerRing,
          {
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: (size * 0.72) / 2,
            borderWidth: ringInner,
          },
        ]}
      />

      {/* cover to create that "track gap" feel */}
      <View
        style={[
          styles.plTrackCover,
          {
            width: size * 0.64,
            height: size * 0.64,
            borderRadius: (size * 0.64) / 2,
          },
        ]}
      />

      {/* orbiting ball */}
      <Animated.View
        style={[
          styles.plBallWrap,
          spin,
          { width: size, height: size, borderRadius: r },
        ]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.plBall,
            {
              width: ball,
              height: ball,
              borderRadius: ball / 2,
              left: r - ball / 2,
              top: r - orbitRadius - ball / 2,
            },
          ]}
        >
          <View style={styles.plBallTexture} />
          <View style={styles.plBallOuterShadow} />
          <View style={styles.plBallInnerShadow} />
          <View style={styles.plBallSideShadows} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pl: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },

  plOuterRing: {
    position: 'absolute',
    borderColor: '#D1D5DB',
    opacity: 0.9,
  },
  plInnerRing: {
    position: 'absolute',
    borderColor: '#111827',
    opacity: 0.55,
  },
  plTrackCover: {
    position: 'absolute',
    backgroundColor: 'transparent', // matches your modal background
    opacity: 1,
  },

  plBallWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
  },

  plBall: {
    position: 'absolute',
    backgroundColor: '#111827',
    overflow: 'hidden',
  },
  plBallTexture: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity: 0.15,
    backgroundColor: '#fff',
  },
  plBallOuterShadow: {
    position: 'absolute',
    left: -6,
    top: -6,
    right: -6,
    bottom: -6,
    borderRadius: 999,
    backgroundColor: '#000',
    opacity: 0.08,
  },
  plBallInnerShadow: {
    position: 'absolute',
    left: 2,
    top: 2,
    right: 2,
    bottom: 2,
    borderRadius: 999,
    backgroundColor: '#000',
    opacity: 0.08,
  },
  plBallSideShadows: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
