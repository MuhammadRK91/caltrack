import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  onPress: () => void;
  style?: ViewStyle;
};

export default function ProBadge({ onPress, style }: Props) {
  return (
    <Pressable onPress={onPress} style={[styles.badge, style]} hitSlop={10}>
      <MaterialCommunityIcons name="crown" size={16} color="#0F5132" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#B7F7A9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
