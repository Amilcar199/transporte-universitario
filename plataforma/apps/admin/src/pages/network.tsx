import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  LABELS,
  ROUTE_DIRECTIONS,
  ROUTE_SERVICE_TYPES,
  WEEKDAY_LABELS,
  type RouteDirection,
  type RouteServiceType,
  type RouteStatus,
  type StopKind,
} from "@uni/shared";
import { api, qs, type Page } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { Badge, ConfirmModal, DemoTag, EntityForm, Loader, Modal, PageHeader, Pagination, useLoad, type FieldDef } from "../ui.tsx";

interface University { id: string; name: string; shortName: string; city: string; address: string | null; lat: number | null; lng: number | null; active: boolean; isDemo: boolean }
interface Stop { id: string; name: string; neighbourhood: string | null; landmark: string | null; city: string; lat: number; lng: number; kind: StopKind; universityId: string | null; universityShortName: string | null; active: boolean; isDemo: boolean }
interface RouteRow { id: string; code: string; name: string; direction: RouteDirection; serviceType: RouteServiceType; status: RouteStatus; isDemo: boolean; stopCount: number; scheduleCount: number; universityNames: string }
interface Schedule { id: string; departureTime: string; daysOfWeek: number[]; active: boolean; validFrom: string | null; validTo: string | null }
interface RouteDetail {
  id: string; code: string; name: string; description: string | null; direction: RouteDirection; serviceType: RouteServiceType; status: RouteStatus; isDemo: boolean;
  universities: { id: string; shortName: string; name: string }[];
  stops: { stopId: string; name: string; position: number; minutesFromStart: number; kind: StopKind; active: boolean }[];
  schedules: Schedule[];
}

const statusTone = (s: RouteStatus) => (s === "active" ? "success" : s === "draft" ? "neutral" : "warning");

// ------------------------------------------------------------ Universidades

export function UniversitiesPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<University | "new" | null>(null);
  const list = useLoad(() => api<Page<University>>(`/admin/universities${qs({ page, search })}`), [page, search]);

  const fields: FieldDef[] = [
    { name: "name", label: "Nome", required: true },
    { name: "shortName", label: "Sigla", required: true },
    { name: "city", label: "Cidade", required: true, placeholder: "Luanda" },
    { name: "address", label: "Morada" },
    { name: "lat", label: "Latitude", type: "number", step: "any" },
    { name: "lng", label: "Longitude", type: "number", step: "any" },
    { name: "active", label: "Activa", type: "checkbox" },
  ];
  const save = async (values: Record<string, any>) => {
    const body = { ...values, lat: values.lat ?? null, lng: values.lng ?? null };
    if (editing === "new") await api("/admin/universities", { method: "POST", body });
    else await api(`/admin/universities/${(editing as University).id}`, { method: "PATCH", body });
    setEditing(null);
    list.reload();
  };

  return (
    <>
      <PageHeader
        title="Universidades"
        subtitle="Instituições servidas. O estatuto de estudante só é concedido após verificação aprovada."
        actions={can("universities.write") && <button className="btn btn-primary" onClick={() => setEditing("new")}>Nova universidade</button>}
      />
      <div className="toolbar">
        <input placeholder="Pesquisar…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Sigla</th><th>Nome</th><th>Cidade</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.shortName}</strong><DemoTag show={u.isDemo} /></td>
                <td>{u.name}</td>
                <td>{u.city}</td>
                <td>{u.active ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                <td className="actions-cell">{can("universities.write") && <button className="btn btn-sm" onClick={() => setEditing(u)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {editing && (
        <Modal title={editing === "new" ? "Nova universidade" : "Editar universidade"} onClose={() => setEditing(null)}>
          <EntityForm fields={fields} initial={editing === "new" ? { active: true, city: "Luanda" } : editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------ Paragens

export function StopsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<Stop | "new" | null>(null);
  const list = useLoad(() => api<Page<Stop>>(`/admin/stops${qs({ page, search, kind })}`), [page, search, kind]);
  const unis = useLoad(() => api<{ universities: { id: string; label: string; name: string }[] }>("/admin/options"), []);

  const fields: FieldDef[] = [
    { name: "name", label: "Nome", required: true },
    { name: "kind", label: "Tipo", type: "select", required: true, options: [{ value: "pickup", label: LABELS.stopKind.pickup }, { value: "destination", label: LABELS.stopKind.destination }] },
    { name: "universityId", label: "Universidade", type: "select", options: unis.data?.universities.map((u) => ({ value: u.id, label: `${u.label} — ${u.name}` })) ?? [], hidden: (v) => v.kind !== "destination", help: "Obrigatório para destinos." },
    { name: "neighbourhood", label: "Bairro" },
    { name: "landmark", label: "Ponto de referência", placeholder: "Ex.: em frente ao mercado" },
    { name: "city", label: "Cidade", required: true },
    { name: "lat", label: "Latitude", type: "number", step: "any", required: true },
    { name: "lng", label: "Longitude", type: "number", step: "any", required: true },
    { name: "active", label: "Activa", type: "checkbox" },
  ];
  const save = async (values: Record<string, any>) => {
    const body = { ...values, universityId: values.kind === "destination" ? values.universityId ?? null : null, kind: values.kind ?? "pickup" };
    if (editing === "new") await api("/admin/stops", { method: "POST", body });
    else await api(`/admin/stops/${(editing as Stop).id}`, { method: "PATCH", body });
    setEditing(null);
    list.reload();
  };

  return (
    <>
      <PageHeader title="Paragens" subtitle="Pontos de embarque e destinos (campus universitários)." actions={can("routes.write") && <button className="btn btn-primary" onClick={() => setEditing("new")}>Nova paragem</button>} />
      <div className="toolbar">
        <input placeholder="Pesquisar por nome, bairro ou referência…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
          <option value="">Todos os tipos</option>
          <option value="pickup">{LABELS.stopKind.pickup}</option>
          <option value="destination">{LABELS.stopKind.destination}</option>
        </select>
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Nome</th><th>Tipo</th><th>Bairro / referência</th><th>Coordenadas</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong><DemoTag show={s.isDemo} /></td>
                <td>{s.kind === "destination" ? <Badge tone="info">Destino · {s.universityShortName}</Badge> : "Embarque"}</td>
                <td>{[s.neighbourhood, s.landmark].filter(Boolean).join(" · ") || "—"}</td>
                <td className="small muted">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</td>
                <td>{s.active ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                <td className="actions-cell">{can("routes.write") && <button className="btn btn-sm" onClick={() => setEditing(s)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {editing && (
        <Modal title={editing === "new" ? "Nova paragem" : "Editar paragem"} onClose={() => setEditing(null)}>
          <EntityForm fields={fields} initial={editing === "new" ? { active: true, city: "Luanda", kind: "pickup" } : editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------ Rotas

export function RoutesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const list = useLoad(() => api<Page<RouteRow>>(`/admin/routes${qs({ page, search })}`), [page, search]);
  const options = useLoad(() => api<{ universities: { id: string; label: string }[] }>("/admin/options"), []);

  const fields: FieldDef[] = [
    { name: "code", label: "Código", required: true, placeholder: "VIA-TAL" },
    { name: "name", label: "Nome", required: true },
    {
      name: "serviceType",
      label: "Tipo de serviço",
      type: "select",
      required: true,
      options: ROUTE_SERVICE_TYPES.map((s) => ({ value: s, label: LABELS.serviceType[s] })),
      help: "Intercidades: só é usada com viagens incluídas no plano, sempre com reserva e com limite por período.",
    },
    { name: "direction", label: "Sentido", type: "select", required: true, options: ROUTE_DIRECTIONS.map((d) => ({ value: d, label: LABELS.direction[d] })), hidden: (v) => v.serviceType === "intercity" },
    { name: "description", label: "Descrição", type: "textarea" },
    { name: "universityIds", label: "Universidades servidas", type: "multiselect", options: options.data?.universities.map((u) => ({ value: u.id, label: u.label })) ?? [], hidden: (v) => v.serviceType === "intercity" },
  ];

  return (
    <>
      <PageHeader title="Rotas e horários" subtitle="As rotas são criadas como rascunho e só podem ser activadas com paragens, destino e horário." actions={can("routes.write") && <button className="btn btn-primary" onClick={() => setCreating(true)}>Nova rota</button>} />
      <div className="toolbar"><input placeholder="Pesquisar por código ou nome…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Código</th><th>Nome</th><th>Sentido</th><th>Universidades</th><th>Paragens</th><th>Horários</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.code}</strong><DemoTag show={r.isDemo} /></td>
                <td>{r.name}</td>
                <td className="small">{r.serviceType === "intercity" ? <Badge tone="info">{LABELS.serviceType.intercity}</Badge> : LABELS.direction[r.direction]}</td>
                <td>{r.universityNames || "—"}</td>
                <td>{r.stopCount}</td>
                <td>{r.scheduleCount}</td>
                <td><Badge tone={statusTone(r.status)}>{LABELS.routeStatus[r.status]}</Badge></td>
                <td className="actions-cell"><Link className="btn btn-sm" to={`/rotas/${r.id}`}>Abrir</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {creating && (
        <Modal title="Nova rota" onClose={() => setCreating(false)}>
          <EntityForm
            fields={fields}
            initial={{ direction: "to_university", serviceType: "university" }}
            submitLabel="Criar rascunho"
            onCancel={() => setCreating(false)}
            onSubmit={async (v) => {
              // As rotas intercidades não têm sentido universitário; guardam-se como ida.
              const body = v.serviceType === "intercity" ? { ...v, direction: "to_university", universityIds: [] } : v;
              const created = await api<{ id: string }>("/admin/routes", { method: "POST", body });
              setCreating(false);
              navigate(`/rotas/${created.id}`);
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function RouteDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const writable = can("routes.write");
  const detail = useLoad(() => api<RouteDetail>(`/admin/routes/${id}`), [id]);
  const allStops = useLoad(() => api<Page<Stop>>("/admin/stops?pageSize=100&active=true"), []);
  const options = useLoad(() => api<{ universities: { id: string; label: string }[] }>("/admin/options"), []);
  const [draft, setDraft] = useState<{ stopId: string; name: string; minutesFromStart: number }[] | null>(null);
  const [addStop, setAddStop] = useState("");
  const [stopError, setStopError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [scheduleEdit, setScheduleEdit] = useState<Schedule | "new" | null>(null);
  const [statusChange, setStatusChange] = useState<RouteStatus | null>(null);

  const route = detail.data;
  const stopsView = draft ?? route?.stops.map((s) => ({ stopId: s.stopId, name: s.name, minutesFromStart: s.minutesFromStart })) ?? [];
  const startDraft = () => setDraft(stopsView.map((s) => ({ ...s })));
  const move = (i: number, delta: number) => {
    const next = [...stopsView];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item!);
    setDraft(next);
  };
  const saveStops = async () => {
    setStopError(null);
    try {
      await api(`/admin/routes/${id}/stops`, { method: "PUT", body: { stops: stopsView.map(({ stopId, minutesFromStart }) => ({ stopId, minutesFromStart })) } });
      setDraft(null);
      detail.reload();
    } catch (e) {
      setStopError(e instanceof Error ? e.message : "Erro ao guardar.");
    }
  };

  return (
    <Loader {...detail}>
      {route && (
        <>
          <PageHeader
            title={`${route.code} · ${route.name}`}
            subtitle={
              route.serviceType === "intercity"
                ? LABELS.serviceType.intercity
                : `${LABELS.direction[route.direction]} · ${route.universities.map((u) => u.shortName).join(", ") || "sem universidades"}`
            }
            actions={
              <>
                <Badge tone={statusTone(route.status)}>{LABELS.routeStatus[route.status]}</Badge>
                {writable && <button className="btn" onClick={() => setEditing(true)}>Editar dados</button>}
                {writable && route.status !== "active" && <button className="btn btn-primary" onClick={() => setStatusChange("active")}>Activar</button>}
                {writable && route.status === "active" && <button className="btn btn-danger" onClick={() => setStatusChange("suspended")}>Suspender</button>}
              </>
            }
          />
          <div className="grid-2">
            <section className="card">
              <h2>Paragens (por ordem de passagem)</h2>
              <p className="muted small">
                {route.serviceType === "intercity"
                  ? "A última paragem é o destino; os estudantes não podem embarcar nela."
                  : route.direction === "to_university"
                    ? "A última paragem deve ser o destino (campus)."
                    : "A primeira paragem deve ser o campus de partida."}{" "}
                Os minutos são contados desde a partida.
              </p>
              {stopsView.length === 0 && <div className="empty">Ainda sem paragens.</div>}
              <ul className="stop-list">
                {stopsView.map((s, i) => (
                  <li key={s.stopId}>
                    <span className="pos">{i + 1}</span>
                    <span className="grow">{s.name}</span>
                    {draft ? (
                      <>
                        <input type="number" min={0} value={s.minutesFromStart} aria-label="Minutos desde a partida" onChange={(e) => setDraft(stopsView.map((x, j) => (j === i ? { ...x, minutesFromStart: Number(e.target.value) } : x)))} />
                        <button className="btn btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                        <button className="btn btn-sm" disabled={i === stopsView.length - 1} onClick={() => move(i, 1)} aria-label="Descer">↓</button>
                        <button className="btn btn-sm" onClick={() => setDraft(stopsView.filter((_, j) => j !== i))} aria-label="Retirar">×</button>
                      </>
                    ) : (
                      <span className="muted small">+{s.minutesFromStart} min</span>
                    )}
                  </li>
                ))}
              </ul>
              {writable && !draft && <button className="btn" onClick={startDraft}>Alterar paragens</button>}
              {draft && (
                <>
                  <div className="toolbar">
                    <select value={addStop} onChange={(e) => setAddStop(e.target.value)}>
                      <option value="">Adicionar paragem…</option>
                      {allStops.data?.items.filter((s) => !stopsView.some((x) => x.stopId === s.id)).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}{s.kind === "destination" ? ` (destino ${s.universityShortName})` : ""}</option>
                      ))}
                    </select>
                    <button className="btn btn-sm" disabled={!addStop} onClick={() => {
                      const s = allStops.data?.items.find((x) => x.id === addStop);
                      if (!s) return;
                      const last = stopsView[stopsView.length - 1]?.minutesFromStart ?? 0;
                      setDraft([...stopsView, { stopId: s.id, name: s.name, minutesFromStart: stopsView.length ? last + 10 : 0 }]);
                      setAddStop("");
                    }}>Adicionar</button>
                  </div>
                  {stopError && <div className="alert alert-danger">{stopError}</div>}
                  <div className="form-actions">
                    <button className="btn" onClick={() => { setDraft(null); setStopError(null); }}>Cancelar</button>
                    <button className="btn btn-primary" onClick={saveStops}>Guardar paragens</button>
                  </div>
                </>
              )}
            </section>
            <section className="card">
              <h2>Horários</h2>
              {route.schedules.length === 0 ? <div className="empty">Ainda sem horários.</div> : (
                <table>
                  <thead><tr><th>Partida</th><th>Dias</th><th>Validade</th><th>Estado</th><th /></tr></thead>
                  <tbody>
                    {route.schedules.map((s) => (
                      <tr key={s.id}>
                        <td><strong>{s.departureTime}</strong></td>
                        <td className="small">{s.daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join(", ")}</td>
                        <td className="small">{s.validFrom || s.validTo ? `${s.validFrom ?? "…"} a ${s.validTo ?? "…"}` : "Sempre"}</td>
                        <td>{s.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                        <td className="actions-cell">{writable && <button className="btn btn-sm" onClick={() => setScheduleEdit(s)}>Editar</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {writable && <button className="btn" style={{ marginTop: 12 }} onClick={() => setScheduleEdit("new")}>Novo horário</button>}
            </section>
          </div>

          {editing && (
            <Modal title="Editar rota" onClose={() => setEditing(false)}>
              <EntityForm
                fields={[
                  { name: "code", label: "Código", required: true },
                  { name: "name", label: "Nome", required: true },
                  { name: "description", label: "Descrição", type: "textarea" },
                  {
                    name: "universityIds",
                    label: "Universidades servidas",
                    type: "multiselect",
                    options: options.data?.universities.map((u) => ({ value: u.id, label: u.label })) ?? [],
                    hidden: () => route.serviceType === "intercity",
                  },
                ]}
                initial={{ ...route, universityIds: route.universities.map((u) => u.id) }}
                onCancel={() => setEditing(false)}
                onSubmit={async (v) => {
                  await api(`/admin/routes/${id}`, { method: "PATCH", body: v });
                  setEditing(false);
                  detail.reload();
                }}
              />
            </Modal>
          )}
          {scheduleEdit && (
            <Modal title={scheduleEdit === "new" ? "Novo horário" : "Editar horário"} onClose={() => setScheduleEdit(null)}>
              <EntityForm
                fields={[
                  { name: "departureTime", label: "Hora de partida", type: "time", required: true },
                  { name: "active", label: "Activo", type: "checkbox" },
                  { name: "daysOfWeek", label: "Dias da semana", type: "weekdays", required: true },
                  { name: "validFrom", label: "Válido desde", type: "date" },
                  { name: "validTo", label: "Válido até", type: "date" },
                ]}
                initial={scheduleEdit === "new" ? { active: true, daysOfWeek: [1, 2, 3, 4, 5] } : scheduleEdit}
                onCancel={() => setScheduleEdit(null)}
                onSubmit={async (v) => {
                  const body = { ...v, validFrom: v.validFrom || null, validTo: v.validTo || null };
                  if (scheduleEdit === "new") await api(`/admin/routes/${id}/schedules`, { method: "POST", body });
                  else await api(`/admin/schedules/${scheduleEdit.id}`, { method: "PATCH", body });
                  setScheduleEdit(null);
                  detail.reload();
                }}
              />
            </Modal>
          )}
          {statusChange && (
            <ConfirmModal
              title={statusChange === "active" ? "Activar rota" : "Suspender rota"}
              message={statusChange === "active" ? "A rota passa a estar visível para os estudantes e disponível para viagens." : "A rota deixa de aceitar novas reservas. As viagens já agendadas mantêm-se até serem canceladas."}
              confirmLabel={statusChange === "active" ? "Activar" : "Suspender"}
              danger={statusChange === "suspended"}
              onClose={() => setStatusChange(null)}
              onConfirm={async () => {
                await api(`/admin/routes/${id}`, { method: "PATCH", body: { status: statusChange } });
                detail.reload();
              }}
            />
          )}
        </>
      )}
    </Loader>
  );
}
