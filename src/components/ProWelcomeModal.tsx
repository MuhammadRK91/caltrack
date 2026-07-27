// src/components/ProWelcomeModal.tsx
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
} from 'react-native';
import ProBurst from './ProBurst';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const MESSAGE_POINTS = [
  'Auto meal & calorie tracking',
  'Daily personalized diet plan',
  'Daily weight tracking',
  'Progress photos',
  'Change goals anytime',
];

export default function ProWelcomeModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Confetti */}
        <ProBurst visible={visible} />

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome to Pro</Text>

          {/* NEW subtitle */}
          <Text style={styles.subtitle}>
            Now you have access to all the features:
          </Text>

          <View style={styles.grid}>
            {MESSAGE_POINTS.map((text, index) => (
              <View key={index} style={styles.gridItem}>
                <Text style={styles.tick}>✓</Text>
                <Text style={styles.pointText}>{text}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={onClose} style={styles.button} hitSlop={8}>
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
    paddingBottom: 18,
  },

  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 10,
      },
    }),
  },

  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },

  // NEW
  subtitle: {
  fontSize: 14,
  fontWeight: '600',
  color: '#374151',
  marginBottom: 12,
},

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  gridItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 10,
    marginBottom: 10,
  },

  tick: {
    color: '#16A34A',
    fontWeight: '800',
    marginRight: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  pointText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
  },

  button: {
    marginTop: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
