import React from "react";
import { Pressable, Text, StyleSheet, View, Platform } from "react-native";
import { BackHandler } from "react-native";

export default function ExitButton() {
  const handleExit = () => {
    BackHandler.exitApp();
  };

  return (
    <Pressable
      onPress={handleExit}
      style={({ pressed }) => [
        styles.button,
        { opacity: pressed ? 0.6 : 1 },
      ]}
      hitSlop={10}
    >
      {/* Icon container just like BackButton */}
      <View style={styles.iconBox}>
        <Text style={styles.icon}>⭘</Text>
      </View>

      <Text style={styles.text}>Exit</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e5e7eb", // same grey background as BackButton
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },

  // Circle box around icon — matching SignUp header button
  iconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#d1d5db", // slightly darker circle
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },

  icon: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "700",
    marginTop: Platform.OS === "android" ? -1 : 0,
  },

  text: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
});
