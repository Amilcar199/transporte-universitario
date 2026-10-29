import { brand } from "@uni/shared";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth.tsx";

/** A app é desenhada para telemóvel: num browser de secretária fica numa coluna com largura de telemóvel. */
const web = Platform.OS === "web";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <View style={web ? styles.backdrop : styles.fill}>
          <View style={web ? styles.frame : styles.fill}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: brand.colors.primary },
                headerTintColor: "#fff",
                headerTitleStyle: { fontWeight: "600" },
                contentStyle: { backgroundColor: brand.colors.background },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false, title: "Iniciar sessão" }} />
              <Stack.Screen name="register" options={{ headerShown: false, title: "Criar conta" }} />
              <Stack.Screen name="forgot" options={{ headerShown: false, title: "Recuperar palavra-passe" }} />
              <Stack.Screen name="student" options={{ headerShown: false }} />
              <Stack.Screen name="driver" options={{ headerShown: false }} />
            </Stack>
          </View>
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, alignItems: "center", backgroundColor: "#DDE3EE" },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    overflow: "hidden",
    backgroundColor: brand.colors.background,
    boxShadow: "0 0 48px rgba(19, 43, 99, 0.18)",
  },
});
