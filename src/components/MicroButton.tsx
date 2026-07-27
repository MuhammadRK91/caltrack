import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, Platform } from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  variant?: 'solid' | 'outline';
};

export default function MicroButton({ label, onPress, style, variant = 'solid' }: Props) {
  const isSolid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false }}
      style={({ pressed }) => [
        styles.base,
        isSolid ? styles.solid : styles.outline,
        pressed && { opacity: Platform.OS === 'ios' ? 0.7 : 1 },
        style,
      ]}
      hitSlop={8}
    >
      <Text style={[styles.label, isSolid ? styles.labelSolid : styles.labelOutline]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 88,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,       // pill
    alignItems: 'center',
    justifyContent: 'center',
  },
  solid:   { backgroundColor: '#000', borderWidth: 1, borderColor: '#000' },
  outline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#000' },
  label: { fontSize: 14, fontWeight: '700' },
  labelSolid:   { color: '#fff' },
  labelOutline: { color: '#000' },
});
