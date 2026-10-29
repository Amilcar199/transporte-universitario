import { brand } from "@uni/shared";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth.tsx";

export default function ValidatorLayout() {
  const { me, loading } = useAuth();
  if (!loading && me?.role !== "partner_validator") return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.colors.primaryDark },
        headerTintColor: "#fff",
        contentStyle: { backgroundColor: brand.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Viagens em curso" }} />
      <Stack.Screen name="scan/[tripId]" options={{ title: "Validar passes" }} />
    </Stack>
  );
}
