import { brand } from "@uni/shared";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth.tsx";

export default function StudentLayout() {
  const { me, loading } = useAuth();
  if (!loading && me?.role !== "student") return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.colors.primary },
        headerTintColor: "#fff",
        contentStyle: { backgroundColor: brand.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="route/[id]" options={{ title: "Rota" }} />
      <Stack.Screen name="live/[tripId]" options={{ title: "Acompanhar viagem" }} />
      <Stack.Screen name="verification" options={{ title: "Inscrição universitária" }} />
      <Stack.Screen name="plans" options={{ title: "Plano e pagamentos" }} />
      <Stack.Screen name="notifications" options={{ title: "Notificações" }} />
      <Stack.Screen name="incident" options={{ title: "Ocorrências" }} />
    </Stack>
  );
}
