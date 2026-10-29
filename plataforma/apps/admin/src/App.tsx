import { useState, type FormEvent, type ReactNode } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { brand, ROLE_LABELS, type Permission } from "@uni/shared";
import { AuthProvider, useAuth } from "./auth.tsx";
import { RouteDetailPage, RoutesPage, StopsPage, UniversitiesPage } from "./pages/network.tsx";
import { FleetPage, IncidentsPage, TripsPage } from "./pages/operations.tsx";
import { StaffPage, StudentsPage, VerificationsPage } from "./pages/people.tsx";
import { PaymentsPage, PlansPage, RefundsPage, SubscriptionsPage } from "./pages/finance.tsx";
import { AuditPage, DashboardPage, SettingsPage } from "./pages/system.tsx";
import { PartnersPage } from "./pages/partners.tsx";
import { ReportsPage } from "./pages/reports.tsx";

interface Section {
  path: string;
  label: string;
  group: string;
  permission: Permission;
  element: ReactNode;
}

const SECTIONS: Section[] = [
  { path: "/", label: "Visão geral", group: "Início", permission: "dashboard.view", element: <DashboardPage /> },
  { path: "/universidades", label: "Universidades", group: "Rede", permission: "universities.read", element: <UniversitiesPage /> },
  { path: "/paragens", label: "Paragens", group: "Rede", permission: "routes.read", element: <StopsPage /> },
  { path: "/rotas", label: "Rotas e horários", group: "Rede", permission: "routes.read", element: <RoutesPage /> },
  { path: "/viagens", label: "Viagens e atribuições", group: "Operação", permission: "trips.read", element: <TripsPage /> },
  { path: "/frota", label: "Veículos e motoristas", group: "Operação", permission: "fleet.read", element: <FleetPage /> },
  { path: "/ocorrencias", label: "Ocorrências", group: "Operação", permission: "incidents.read", element: <IncidentsPage /> },
  { path: "/parceiros", label: "Transportadoras parceiras", group: "Operação", permission: "partners.read", element: <PartnersPage /> },
  { path: "/relatorios", label: "Relatórios", group: "Operação", permission: "reports.view", element: <ReportsPage /> },
  { path: "/estudantes", label: "Estudantes", group: "Estudantes", permission: "students.read", element: <StudentsPage /> },
  { path: "/verificacoes", label: "Verificações", group: "Estudantes", permission: "students.read", element: <VerificationsPage /> },
  { path: "/planos", label: "Planos", group: "Finanças", permission: "plans.read", element: <PlansPage /> },
  { path: "/subscricoes", label: "Subscrições", group: "Finanças", permission: "subscriptions.read", element: <SubscriptionsPage /> },
  { path: "/pagamentos", label: "Pagamentos", group: "Finanças", permission: "payments.read", element: <PaymentsPage /> },
  { path: "/reembolsos", label: "Reembolsos", group: "Finanças", permission: "refunds.manage", element: <RefundsPage /> },
  { path: "/equipa", label: "Equipa e perfis", group: "Administração", permission: "users.manage", element: <StaffPage /> },
  { path: "/auditoria", label: "Auditoria", group: "Administração", permission: "audit.read", element: <AuditPage /> },
  { path: "/definicoes", label: "Definições", group: "Administração", permission: "settings.manage", element: <SettingsPage /> },
];

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}

function Shell() {
  const { me, loading, can, logout } = useAuth();
  if (loading) return <div className="pad muted">A carregar…</div>;
  if (!me) return <LoginPage />;

  const allowed = SECTIONS.filter((s) => can(s.permission));
  const groups = [...new Set(allowed.map((s) => s.group))];
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">{brand.logo.monogram}</div>
          <div>
            <div className="brand-name">{brand.name}</div>
            <div className="brand-sub">Painel administrativo</div>
          </div>
        </div>
        {groups.map((g) => (
          <div key={g} style={{ display: "contents" }}>
            <div className="nav-group">{g}</div>
            {allowed.filter((s) => s.group === g).map((s) => (
              <NavLink key={s.path} to={s.path} end={s.path === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                {s.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div><strong>{me.fullName}</strong></div>
          <div style={{ opacity: 0.75 }}>{ROLE_LABELS[me.role]}</div>
          <button className="btn btn-sm" onClick={logout}>Terminar sessão</button>
        </div>
      </aside>
      <main className="main">
        {allowed.length === 0 ? (
          <div className="empty">O seu perfil não tem secções disponíveis no painel. A validação de passes faz-se na aplicação móvel.</div>
        ) : (
          <Routes>
            {allowed.map((s) => <Route key={s.path} path={s.path} element={s.element} />)}
            {can("routes.read") && <Route path="/rotas/:id" element={<RouteDetailPage />} />}
            <Route path="*" element={<Navigate to={allowed[0]!.path} replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar sessão.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="login-card form" onSubmit={submit}>
        <div className="brand">
          <div className="brand-mark">{brand.logo.monogram}</div>
          <div>
            <div className="brand-name">{brand.name}</div>
            <div className="brand-sub muted">Painel administrativo</div>
          </div>
        </div>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Palavra-passe</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert alert-danger">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "A entrar…" : "Entrar"}</button>
        <p className="muted small">Acesso reservado à equipa. As permissões são verificadas pelo servidor em cada operação.</p>
      </form>
    </div>
  );
}
