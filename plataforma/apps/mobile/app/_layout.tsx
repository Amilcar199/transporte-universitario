import { brand } from "@uni/shared";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth.tsx";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: brand.colors.primary },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: brand.colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: "Iniciar sessão" }} />
          <Stack.Screen name="register" options={{ title: "Criar conta" }} />
          <Stack.Screen name="forgot" options={{ title: "Recuperar palavra-passe" }} />
          <Stack.Screen name="student" options={{ headerShown: false }} />
          <Stack.Screen name="driver" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
