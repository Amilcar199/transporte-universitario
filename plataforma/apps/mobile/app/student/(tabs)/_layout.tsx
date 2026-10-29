import { brand } from "@uni/shared";
import { Tabs } from "expo-router";

export default function StudentTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: brand.colors.primary },
        headerTintColor: "#fff",
        tabBarActiveTintColor: brand.colors.primary,
        tabBarInactiveTintColor: brand.colors.textMuted,
        tabBarIconStyle: { display: "none" },
        tabBarLabelStyle: { fontSize: 14, fontWeight: "600" },
        tabBarItemStyle: { justifyContent: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Início", headerTitle: brand.name }} />
      <Tabs.Screen name="routes" options={{ title: "Rotas" }} />
      <Tabs.Screen name="bookings" options={{ title: "Reservas" }} />
      <Tabs.Screen name="pass" options={{ title: "Passe" }} />
      <Tabs.Screen name="account" options={{ title: "Conta" }} />
    </Tabs>
  );
}
