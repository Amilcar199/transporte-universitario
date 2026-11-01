import { useState, type FormEvent, type ReactNode } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { brand, ROLE_LABELS, type Permission } from "@uni/shared";
import { AuthProvider, useAuth } from "./auth.tsx";
import { initials } from "./ui.tsx";
import { RoutesPage, StopsPage, UniversitiesPage } from "./pages/network.tsx";
import { FleetPage, IncidentsPage, TripsPage } from "./pages/operations.tsx";
import { StaffPage, StudentsPage, VerificationsPage } from "./pages/people.tsx";
import { PaymentsPage, PlansPage, RefundsPage, SubscriptionsPage } from "./pages/finance.tsx";
import { AuditPage, DashboardPage, SettingsPage } from "./pages/system.tsx";
import { PartnersPage } from "./pages/partners.tsx";
import { ReportsPage } from "./pages/reports.tsx";

interface Section {
  path: string;
  label: string;
  permission: Permission;
  element: ReactNode;
}

const SECTIONS: Section[] = [
  { path: "/", label: "Visão geral", permission: "dashboard.view", element: <DashboardPage /> },
  { path: "/estudantes", label: "Estudantes", permission: "students.read", element: <StudentsPage /> },
  { path: "/verificacoes", label: "Verificações", permission: "students.read", element: <VerificationsPage /> },
  { path: "/universidades", label: "Universidades", permission: "universities.read", element: <UniversitiesPage /> },
  { path: "/rotas", label: "Rotas", permission: "routes.read", element: <RoutesPage /> },
  { path: "/paragens", label: "Paragens", permission: "routes.read", element: <StopsPage /> },
  { path: "/viagens", label: "Viagens e atribuições", permission: "trips.read", element: <TripsPage /> },
  { path: "/frota", label: "Veículos e motoristas", permission: "fleet.read", element: <FleetPage /> },
  { path: "/planos", label: "Planos", permission: "plans.read", element: <PlansPage /> },
  { path: "/subscricoes", label: "Subscrições", permission: "subscriptions.read", element: <SubscriptionsPage /> },
  { path: "/pagamentos", label: "Pagamentos", permission: "payments.read", element: <PaymentsPage /> },
  { path: "/reembolsos", label: "Reembolsos", permission: "refunds.manage", element: <RefundsPage /> },
  { path: "/parceiros", label: "Transportadoras parceiras", permission: "partners.read", element: <PartnersPage /> },
  { path: "/ocorrencias", label: "Ocorrências", permission: "incidents.read", element: <IncidentsPage /> },
  { path: "/relatorios", label: "Relatórios", permission: "reports.view", element: <ReportsPage /> },
  { path: "/equipa", label: "Equipa e perfis", permission: "users.manage", element: <StaffPage /> },
  { path: "/auditoria", label: "Auditoria", permission: "audit.read", element: <AuditPage /> },
  { path: "/definicoes", label: "Definições", permission: "settings.manage", element: <SettingsPage /> },
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
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">{brand.logo.monogram}</div>
          <div>
            <div className="brand-name">{brand.name}</div>
            <div className="brand-sub">Painel de operação</div>
          </div>
        </div>
        {allowed.map((s) => (
          <NavLink key={s.path} to={s.path} end={s.path === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            {s.label}
          </NavLink>
        ))}
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="user-chip">
            <div className="avatar">{initials(me.fullName)}</div>
            <div>
              <strong>{me.fullName}</strong>
              <span>{ROLE_LABELS[me.role]}</span>
            </div>
          </div>
          <button className="btn btn-sm" onClick={logout}>Terminar sessão</button>
        </div>
        {allowed.length === 0 ? (
          <div className="empty">O seu perfil não tem secções disponíveis no painel. A validação de passes faz-se na aplicação móvel.</div>
        ) : (
          <Routes>
            {allowed.map((s) => <Route key={s.path} path={s.path} element={s.element} />)}
            {can("routes.read") && <Route path="/rotas/:id" element={<RoutesPage />} />}
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
