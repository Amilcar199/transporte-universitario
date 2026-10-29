import { useState } from "react";
import { LABELS, ROLE_LABELS, STAFF_ROLES, VERIFICATION_STATUSES, type Role, type VerificationStatus } from "@uni/shared";
import { api, qs, type Page } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { Badge, ConfirmModal, DemoTag, EntityForm, formatDateTime, Loader, Modal, PageHeader, Pagination, useLoad, type FieldDef } from "../ui.tsx";

const verificationTone = (s: VerificationStatus) => (s === "approved" ? "success" : s === "pending" ? "warning" : s === "rejected" ? "danger" : "neutral");

interface Student { id: string; fullName: string; email: string; phone: string | null; status: "active" | "disabled"; isDemo: boolean; universityShortName: string | null; studentNumber: string | null; verificationStatus: VerificationStatus }

export function StudentsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [verification, setVerification] = useState("");
  const [toggling, setToggling] = useState<Student | null>(null);
  const list = useLoad(() => api<Page<Student>>(`/admin/students${qs({ page, search, verification })}`), [page, search, verification]);
  return (
    <>
      <PageHeader title="Estudantes" subtitle="A universidade indicada no registo só conta depois de a verificação ser aprovada." />
      <div className="toolbar">
        <input placeholder="Pesquisar nome, email ou n.º de estudante…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select value={verification} onChange={(e) => { setVerification(e.target.value); setPage(1); }}>
          <option value="">Todas as verificações</option>
          {VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{LABELS.verification[s]}</option>)}
        </select>
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Nome</th><th>Contacto</th><th>Universidade</th><th>N.º estudante</th><th>Verificação</th><th>Conta</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.fullName}</strong><DemoTag show={s.isDemo} /></td>
                <td className="small">{s.email}<br />{s.phone ?? ""}</td>
                <td>{s.universityShortName ?? "—"}</td>
                <td>{s.studentNumber ?? "—"}</td>
                <td><Badge tone={verificationTone(s.verificationStatus)}>{LABELS.verification[s.verificationStatus]}</Badge></td>
                <td>{s.status === "active" ? <Badge tone="success">Activa</Badge> : <Badge tone="danger">Desactivada</Badge>}</td>
                <td className="actions-cell">{can("users.manage") && <button className="btn btn-sm" onClick={() => setToggling(s)}>{s.status === "active" ? "Desactivar" : "Reactivar"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {toggling && (
        <ConfirmModal
          title={toggling.status === "active" ? "Desactivar conta" : "Reactivar conta"}
          message={toggling.status === "active" ? `${toggling.fullName} deixa de conseguir entrar e as sessões abertas terminam. Os dados e o histórico mantêm-se.` : `${toggling.fullName} volta a poder entrar.`}
          danger={toggling.status === "active"}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            await api(`/admin/students/${toggling.id}`, { method: "PATCH", body: { status: toggling.status === "active" ? "disabled" : "active" } });
            list.reload();
          }}
        />
      )}
    </>
  );
}

interface Verification { id: string; status: VerificationStatus; studentNumber: string; documentNote: string | null; decisionNote: string | null; createdAt: string; decidedAt: string | null; studentName: string; studentEmail: string; universityShortName: string }

export function VerificationsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [page, setPage] = useState(1);
  const [deciding, setDeciding] = useState<{ v: Verification; decision: "approved" | "rejected" } | null>(null);
  const list = useLoad(() => api<Page<Verification>>(`/admin/verifications${qs({ status, page })}`), [status, page]);
  return (
    <>
      <PageHeader title="Verificações universitárias" subtitle="Confirme a inscrição do estudante (por exemplo, junto da secretaria) antes de aprovar." />
      <div className="toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value as VerificationStatus); setPage(1); }}>
          {(["pending", "approved", "rejected"] as const).map((s) => <option key={s} value={s}>{LABELS.verification[s]}</option>)}
        </select>
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0} empty="Sem pedidos neste estado.">
        <table>
          <thead><tr><th>Pedido</th><th>Estudante</th><th>Universidade</th><th>N.º estudante</th><th>Observações</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((v) => (
              <tr key={v.id}>
                <td className="small">{formatDateTime(v.createdAt)}</td>
                <td>{v.studentName}<br /><span className="small muted">{v.studentEmail}</span></td>
                <td>{v.universityShortName}</td>
                <td>{v.studentNumber}</td>
                <td className="small">{v.documentNote ?? "—"}{v.decisionNote && <><br /><em>Decisão: {v.decisionNote}</em></>}</td>
                <td><Badge tone={verificationTone(v.status)}>{LABELS.verification[v.status]}</Badge></td>
                <td className="actions-cell">
                  {can("students.verify") && v.status === "pending" && (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => setDeciding({ v, decision: "approved" })}>Aprovar</button>{" "}
                      <button className="btn btn-sm" onClick={() => setDeciding({ v, decision: "rejected" })}>Rejeitar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {deciding && (
        <ConfirmModal
          title={deciding.decision === "approved" ? "Aprovar verificação" : "Rejeitar verificação"}
          message={deciding.decision === "approved"
            ? `Confirma que ${deciding.v.studentName} está inscrito(a) na ${deciding.v.universityShortName} com o n.º ${deciding.v.studentNumber}? A partir daqui pode subscrever planos.`
            : `O pedido de ${deciding.v.studentName} será rejeitado e o estudante notificado com o motivo.`}
          confirmLabel={deciding.decision === "approved" ? "Aprovar" : "Rejeitar"}
          danger={deciding.decision === "rejected"}
          requireReason={deciding.decision === "rejected" ? "Motivo da rejeição" : undefined}
          onClose={() => setDeciding(null)}
          onConfirm={async (note) => {
            await api(`/admin/verifications/${deciding.v.id}/decision`, { method: "POST", body: { decision: deciding.decision, note: note || undefined } });
            list.reload();
          }}
        />
      )}
    </>
  );
}

interface Staff {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: "active" | "disabled";
  isDemo: boolean;
  universities?: { id: string; shortName: string }[];
  carriers?: { id: string; name: string }[];
}

export function StaffPage() {
  const { me, can } = useAuth();
  const partners = useLoad(
    () => (can("partners.read") ? api<{ id: string; name: string; active: boolean }[]>("/admin/partners") : Promise.resolve([])),
    [],
  );
  const carrierOptions = (partners.data ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const list = useLoad(() => api<Page<Staff>>(`/admin/staff${qs({ page, search })}`), [page, search]);
  const unis = useLoad(() => api<{ universities: { id: string; label: string }[] }>("/admin/options"), []);
  const roles = STAFF_ROLES.filter((r) => r !== "super_admin" || me?.role === "super_admin");
  const roleOptions = roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const uniOptions = unis.data?.universities.map((u) => ({ value: u.id, label: u.label })) ?? [];
  const base: FieldDef[] = [
    { name: "fullName", label: "Nome completo", required: true },
    { name: "phone", label: "Telefone" },
    { name: "role", label: "Perfil", type: "select", required: true, options: roleOptions },
    { name: "universityIds", label: "Universidades geridas", type: "multiselect", options: uniOptions, hidden: (v) => v.role !== "university_manager" },
    {
      name: "carrierIds",
      label: "Transportadoras parceiras",
      type: "multiselect",
      options: carrierOptions,
      help: "O validador só pode validar passes em viagens feitas com veículos destas transportadoras.",
      hidden: (v) => v.role !== "partner_validator",
    },
  ];
  const createFields: FieldDef[] = [
    base[0]!,
    { name: "email", label: "Email", type: "email", required: true },
    ...base.slice(1),
    { name: "temporaryPassword", label: "Palavra-passe temporária", type: "password", required: true, help: "Mínimo 8 caracteres; comunique-a por um canal seguro." },
  ];
  const editFields: FieldDef[] = [...base, { name: "status", label: "Estado", type: "select", required: true, options: [{ value: "active", label: "Activo" }, { value: "disabled", label: "Desactivado" }] }];

  const openEdit = async (s: Staff) => setEditing(await api<Staff>(`/admin/staff/${s.id}`));

  return (
    <>
      <PageHeader title="Equipa e perfis" subtitle="Cada perfil tem permissões fixas, verificadas pelo servidor. Motoristas são geridos em Frota." actions={<button className="btn btn-primary" onClick={() => setEditing("new")}>Novo membro</button>} />
      <div className="toolbar"><input placeholder="Pesquisar…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.fullName}</strong><DemoTag show={s.isDemo} /></td>
                <td>{s.email}</td>
                <td>{ROLE_LABELS[s.role]}</td>
                <td>{s.status === "active" ? <Badge tone="success">Activo</Badge> : <Badge tone="danger">Desactivado</Badge>}</td>
                <td className="actions-cell">{s.id !== me?.id && <button className="btn btn-sm" onClick={() => openEdit(s)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {editing && (
        <Modal title={editing === "new" ? "Novo membro da equipa" : "Editar membro da equipa"} onClose={() => setEditing(null)}>
          <EntityForm
            fields={editing === "new" ? createFields : editFields}
            initial={
              editing === "new"
                ? { role: "transport_operator", universityIds: [], carrierIds: [] }
                : { ...editing, universityIds: editing.universities?.map((u) => u.id) ?? [], carrierIds: editing.carriers?.map((c) => c.id) ?? [] }
            }
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              const body = { ...v, phone: v.phone || undefined };
              if (editing === "new") await api("/admin/staff", { method: "POST", body });
              else await api(`/admin/staff/${editing.id}`, { method: "PATCH", body });
              setEditing(null);
              list.reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
