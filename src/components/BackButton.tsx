import React from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

export default function BackButton() {
  const navigation = useNavigation<any>();

  return (
    <Pressable
      onPress={() => navigation.goBack()}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? "rgba(0,0,0,0.08)" : "transparent" },
      ]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="arrow-back" size={18} color="#000" style={{ opacity: 0.6 }} />
      </View>
      <Text style={styles.text}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  iconWrap: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 6,
    padding: 6,
    marginRight: 6,
    transition: "all 0.2s",
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
});
