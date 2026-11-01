import { brand } from "@uni/shared";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "../../../src/kit.tsx";

function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  return (
    <View style={{ paddingHorizontal: 18, paddingVertical: 5, borderRadius: 999, backgroundColor: focused ? brand.colors.primaryLight : "transparent" }}>
      <Icon name={name} color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
    </View>
  );
}

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "Início", icon: "home" },
  { name: "routes", title: "Rotas", icon: "route" },
  { name: "map", title: "Mapa", icon: "pin" },
  { name: "pass", title: "Passe", icon: "card" },
  { name: "account", title: "Perfil", icon: "user" },
];

export default function StudentTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.colors.primary,
        tabBarInactiveTintColor: "#5B6474",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600", marginTop: 2 },
        tabBarStyle: { height: 66 + insets.bottom, paddingTop: 8, paddingBottom: 8 + insets.bottom, borderTopColor: "#E8ECF2", backgroundColor: "#fff" },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ focused, color }) => <TabIcon name={t.icon} focused={focused} color={color} /> }}
        />
      ))}
    </Tabs>
  );
}
