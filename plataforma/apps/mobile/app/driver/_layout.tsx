import { brand } from "@uni/shared";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth.tsx";

export default function DriverLayout() {
  const { me, loading } = useAuth();
  if (!loading && me?.role !== "driver") return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.colors.primaryDark },
        headerTintColor: "#fff",
        contentStyle: { backgroundColor: brand.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "As minhas viagens", headerShown: false }} />
      <Stack.Screen name="trip/[id]" options={{ title: "Viagem", headerShown: false }} />
      <Stack.Screen name="scan/[tripId]" options={{ title: "Validar passes", headerShown: false }} />
      <Stack.Screen name="incident" options={{ title: "Comunicar ocorrência" }} />
    </Stack>
  );
}
