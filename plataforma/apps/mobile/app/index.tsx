import { brand } from "@uni/shared";
import { Redirect } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../src/auth.tsx";
import { Body, Button, Card, Loading, Screen, Title } from "../src/ui.tsx";

/** Encaminha cada perfil para a sua área. A equipa de operação usa o painel web. */
export default function Index() {
  const { me, loading, logout } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: brand.colors.background }}>
        <Loading />
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;
  if (me.role === "student") return <Redirect href="/student" />;
  if (me.role === "driver") return <Redirect href="/driver" />;
  if (me.role === "partner_validator") return <Redirect href="/validator" />;
  return (
    <Screen>
      <Card>
        <Title>Conta da equipa</Title>
        <Body>
          Esta conta ({me.email}) pertence à equipa de operação. A gestão faz-se no painel administrativo web; a app destina-se a
          estudantes, motoristas e validadores de transportadoras parceiras.
        </Body>
        <Button label="Terminar sessão" variant="secondary" onPress={() => void logout()} />
      </Card>
    </Screen>
  );
}
