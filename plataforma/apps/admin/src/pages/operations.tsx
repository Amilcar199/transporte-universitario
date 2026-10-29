import { useState } from "react";
import { INCIDENT_STATUSES, LABELS, VEHICLE_STATUSES, type IncidentKind, type IncidentStatus, type TripStatus, type VehicleStatus } from "@uni/shared";
import { api, qs, type Page } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { Badge, ConfirmModal, DemoTag, EntityForm, formatDateTime, formatDate, Loader, Modal, PageHeader, Pagination, useLoad, type FieldDef } from "../ui.tsx";

interface TripRow { id: string; serviceDate: string; departureTime: string; status: TripStatus; capacity: number; routeId: string; routeCode: string; routeName: string; vehicleId: string; vehiclePlate: string; driverId: string; driverName: string; booked: number }
interface TripDetail extends TripRow {
  startedAt: string | null; finishedAt: string | null; cancelReason: string | null;
  manifest: { bookingId: string; seatNumber: number; status: string; studentName: string; stopName: string; boardedAt: string | null }[];
  lastLocation: { lat: number; lng: number; recordedAt: string } | null;
}
interface Vehicle { id: string; plate: string; model: string; capacity: number; status: VehicleStatus; carrierId: string | null; notes: string | null; isDemo: boolean }
interface Driver { id: string; fullName: string; email: string; phone: string | null; status: "active" | "disabled"; isDemo: boolean; licenceNumber: string; defaultVehicleId: string | null; defaultVehiclePlate: string | null }

const tripTone = (s: TripStatus) => (s === "in_progress" ? "info" : s === "completed" ? "success" : s === "cancelled" ? "danger" : "neutral");

function luandaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda" }).format(new Date());
}

// ------------------------------------------------------------ Viagens

export function TripsPage() {
  const { can } = useAuth();
  const [date, setDate] = useState(luandaToday());
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useLoad(() => api<Page<TripRow>>(`/admin/trips${qs({ date, status, page })}`), [date, status, page]);

  return (
    <>
      <PageHeader title="Viagens e atribuições" subtitle="Atribuição de veículo e motorista a cada partida. A capacidade vendável é a do veículo." actions={can("trips.write") && <button className="btn btn-primary" onClick={() => setCreating(true)}>Nova atribuição</button>} />
      <div className="toolbar">
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} aria-label="Data" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos os estados</option>
          {Object.entries(LABELS.tripStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0} empty="Não há viagens atribuídas para esta data.">
        <table>
          <thead><tr><th>Data</th><th>Partida</th><th>Rota</th><th>Veículo</th><th>Motorista</th><th>Ocupação</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((t) => (
              <tr key={t.id}>
                <td>{formatDate(t.serviceDate)}</td>
                <td><strong>{t.departureTime}</strong></td>
                <td>{t.routeCode} <span className="muted small">{t.routeName}</span></td>
                <td>{t.vehiclePlate}</td>
                <td>{t.driverName}</td>
                <td>{t.booked} / {t.capacity}</td>
                <td><Badge tone={tripTone(t.status)}>{LABELS.tripStatus[t.status]}</Badge></td>
                <td className="actions-cell"><button className="btn btn-sm" onClick={() => setOpenId(t.id)}>Detalhe</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {creating && <TripCreateModal defaultDate={date} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} />}
      {openId && <TripDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </>
  );
}

function useAssignables() {
  return useLoad(
    () =>
      Promise.all([
        api<Page<Vehicle>>("/admin/vehicles?status=active&pageSize=100"),
        api<Page<Driver>>("/admin/drivers?status=active&pageSize=100"),
      ]).then(([v, d]) => ({ vehicles: v.items, drivers: d.items })),
    [],
  );
}

function TripCreateModal({ defaultDate, onClose, onCreated }: { defaultDate: string; onClose: () => void; onCreated: () => void }) {
  const routes = useLoad(() => api<{ routes: { id: string; label: string; name: string; status: string }[] }>("/admin/options"), []);
  const assignables = useAssignables();
  const [routeId, setRouteId] = useState("");
  const schedules = useLoad(
    () => (routeId ? api<{ schedules: { id: string; departureTime: string; active: boolean }[] }>(`/admin/routes/${routeId}`).then((r) => r.schedules.filter((s) => s.active)) : Promise.resolve([])),
    [routeId],
  );
  const fields: FieldDef[] = [
    { name: "scheduleId", label: "Horário", type: "select", required: true, options: (schedules.data ?? []).map((s) => ({ value: s.id, label: s.departureTime })), help: routeId && schedules.data?.length === 0 ? "Esta rota não tem horários activos." : undefined },
    { name: "serviceDate", label: "Data", type: "date", required: true },
    { name: "vehicleId", label: "Veículo", type: "select", required: true, options: (assignables.data?.vehicles ?? []).map((v) => ({ value: v.id, label: `${v.plate} · ${v.model} (${v.capacity} lugares)` })) },
    { name: "driverId", label: "Motorista", type: "select", required: true, options: (assignables.data?.drivers ?? []).map((d) => ({ value: d.id, label: d.fullName })) },
  ];
  return (
    <Modal title="Nova atribuição" onClose={onClose}>
      <label className="field" style={{ marginBottom: 12 }}>
        <span>Rota *</span>
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="">— Seleccione —</option>
          {routes.data?.routes.filter((r) => r.status === "active").map((r) => <option key={r.id} value={r.id}>{r.label} · {r.name}</option>)}
        </select>
        <small className="muted">Só rotas activas aceitam viagens.</small>
      </label>
      {routeId && schedules.data && (
        <EntityForm
          key={routeId}
          fields={fields}
          initial={{ serviceDate: defaultDate }}
          submitLabel="Atribuir"
          onCancel={onClose}
          onSubmit={async (v) => {
            await api("/admin/trips", { method: "POST", body: { ...v, routeId } });
            onCreated();
          }}
        />
      )}
    </Modal>
  );
}

function TripDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const detail = useLoad(() => api<TripDetail>(`/admin/trips/${id}`), [id]);
  const assignables = useAssignables();
  const [reassign, setReassign] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const t = detail.data;
  return (
    <Modal title="Detalhe da viagem" onClose={onClose} wide>
      <Loader {...detail}>
        {t && (
          <>
            <p>
              <strong>{t.routeCode}</strong> · {t.routeName} · {formatDate(t.serviceDate)} às <strong>{t.departureTime}</strong>{" "}
              <Badge tone={tripTone(t.status)}>{LABELS.tripStatus[t.status]}</Badge>
            </p>
            <p className="muted">Veículo {t.vehiclePlate} · Motorista {t.driverName} · {t.booked}/{t.capacity} lugares reservados</p>
            {t.startedAt && <p className="small">Iniciada: {formatDateTime(t.startedAt)}{t.finishedAt && ` · Terminada: ${formatDateTime(t.finishedAt)}`}</p>}
            {t.cancelReason && <div className="alert alert-warning">Cancelada: {t.cancelReason}</div>}
            {t.status === "in_progress" && (
              <div className="alert alert-info">
                {t.lastLocation ? `Última posição recebida às ${formatDateTime(t.lastLocation.recordedAt)} (${t.lastLocation.lat.toFixed(5)}, ${t.lastLocation.lng.toFixed(5)}).` : "Ainda não foi recebida nenhuma posição do motorista."}
              </div>
            )}
            <h3>Passageiros</h3>
            {t.manifest.length === 0 ? <div className="empty">Sem reservas.</div> : (
              <table>
                <thead><tr><th>Lugar</th><th>Estudante</th><th>Paragem</th><th>Estado</th></tr></thead>
                <tbody>
                  {t.manifest.map((m) => (
                    <tr key={m.bookingId}>
                      <td>{m.seatNumber}</td>
                      <td>{m.studentName}</td>
                      <td>{m.stopName}</td>
                      <td>{LABELS.bookingStatus[m.status as keyof typeof LABELS.bookingStatus]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {can("trips.write") && t.status === "scheduled" && (
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button className="btn" onClick={() => setReassign(true)}>Alterar veículo / motorista</button>
                <button className="btn btn-danger" onClick={() => setCancelling(true)}>Cancelar viagem</button>
              </div>
            )}
            {reassign && (
              <Modal title="Alterar atribuição" onClose={() => setReassign(false)}>
                <EntityForm
                  fields={[
                    { name: "vehicleId", label: "Veículo", type: "select", options: (assignables.data?.vehicles ?? []).map((v) => ({ value: v.id, label: `${v.plate} (${v.capacity} lugares)` })) },
                    { name: "driverId", label: "Motorista", type: "select", options: (assignables.data?.drivers ?? []).map((d) => ({ value: d.id, label: d.fullName })) },
                  ]}
                  initial={{ vehicleId: t.vehicleId, driverId: t.driverId }}
                  onCancel={() => setReassign(false)}
                  onSubmit={async (v) => {
                    await api(`/admin/trips/${id}`, { method: "PATCH", body: { vehicleId: v.vehicleId ?? undefined, driverId: v.driverId ?? undefined } });
                    setReassign(false);
                    detail.reload();
                    onChanged();
                  }}
                />
              </Modal>
            )}
            {cancelling && (
              <ConfirmModal
                title="Cancelar viagem"
                message={`As ${t.booked} reserva(s) confirmadas serão canceladas e os estudantes notificados. Esta acção não pode ser desfeita.`}
                confirmLabel="Cancelar viagem"
                danger
                requireReason="Motivo (enviado aos estudantes)"
                onClose={() => setCancelling(false)}
                onConfirm={async (reason) => {
                  await api(`/admin/trips/${id}`, { method: "PATCH", body: { status: "cancelled", cancelReason: reason } });
                  detail.reload();
                  onChanged();
                }}
              />
            )}
          </>
        )}
      </Loader>
    </Modal>
  );
}

// ------------------------------------------------------------ Frota

export function FleetPage() {
  const [tab, setTab] = useState<"vehicles" | "drivers">("vehicles");
  return (
    <>
      <PageHeader title="Veículos e motoristas" actions={
        <>
          <button className={`btn ${tab === "vehicles" ? "btn-primary" : ""}`} onClick={() => setTab("vehicles")}>Veículos</button>
          <button className={`btn ${tab === "drivers" ? "btn-primary" : ""}`} onClick={() => setTab("drivers")}>Motoristas</button>
        </>
      } />
      {tab === "vehicles" ? <VehiclesTab /> : <DriversTab />}
    </>
  );
}

function VehiclesTab() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const list = useLoad(() => api<Page<Vehicle>>(`/admin/vehicles${qs({ page, search })}`), [page, search]);
  const partners = useLoad(
    () => (can("partners.read") ? api<{ id: string; name: string; active: boolean }[]>("/admin/partners") : Promise.resolve([])),
    [],
  );
  const carrierName = (id: string | null) => (id ? partners.data?.find((p) => p.id === id)?.name ?? "Parceiro" : "Frota própria");
  const fields: FieldDef[] = [
    { name: "plate", label: "Matrícula", required: true, placeholder: "LD-00-00-AA" },
    { name: "model", label: "Modelo", required: true },
    { name: "capacity", label: "Lugares para passageiros", type: "number", required: true },
    { name: "status", label: "Estado", type: "select", required: true, options: VEHICLE_STATUSES.map((s) => ({ value: s, label: LABELS.vehicleStatus[s] })) },
    {
      name: "carrierId",
      label: "Operado por",
      type: "select",
      options: (partners.data ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })),
      help: "Deixe por seleccionar para frota própria. Associe só transportadoras com acordo formal.",
    },
    { name: "notes", label: "Notas", type: "textarea" },
  ];
  return (
    <>
      <div className="toolbar">
        <input placeholder="Pesquisar matrícula ou modelo…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        {can("fleet.write") && <button className="btn btn-primary" onClick={() => setEditing("new")}>Novo veículo</button>}
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Matrícula</th><th>Modelo</th><th>Lugares</th><th>Operado por</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((v) => (
              <tr key={v.id}>
                <td><strong>{v.plate}</strong><DemoTag show={v.isDemo} /></td>
                <td>{v.model}</td>
                <td>{v.capacity}</td>
                <td className="small">{carrierName(v.carrierId)}</td>
                <td><Badge tone={v.status === "active" ? "success" : v.status === "maintenance" ? "warning" : "neutral"}>{LABELS.vehicleStatus[v.status]}</Badge></td>
                <td className="actions-cell">{can("fleet.write") && <button className="btn btn-sm" onClick={() => setEditing(v)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {editing && (
        <Modal title={editing === "new" ? "Novo veículo" : "Editar veículo"} onClose={() => setEditing(null)}>
          <EntityForm fields={fields} initial={editing === "new" ? { status: "active" } : editing} onCancel={() => setEditing(null)} onSubmit={async (v) => {
            if (editing === "new") await api("/admin/vehicles", { method: "POST", body: v });
            else await api(`/admin/vehicles/${editing.id}`, { method: "PATCH", body: v });
            setEditing(null);
            list.reload();
          }} />
        </Modal>
      )}
    </>
  );
}

function DriversTab() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Driver | "new" | null>(null);
  const [toggling, setToggling] = useState<Driver | null>(null);
  const list = useLoad(() => api<Page<Driver>>(`/admin/drivers${qs({ page, search })}`), [page, search]);
  const vehicles = useLoad(() => api<Page<Vehicle>>("/admin/vehicles?pageSize=100"), []);
  const vehicleOptions = (vehicles.data?.items ?? []).map((v) => ({ value: v.id, label: v.plate }));
  const createFields: FieldDef[] = [
    { name: "fullName", label: "Nome completo", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Telefone", placeholder: "+244 9XX XXX XXX" },
    { name: "licenceNumber", label: "N.º da carta de condução", required: true },
    { name: "temporaryPassword", label: "Palavra-passe temporária", type: "password", required: true, help: "Comunique-a ao motorista por um canal seguro. Mínimo 8 caracteres." },
    { name: "defaultVehicleId", label: "Veículo habitual", type: "select", options: vehicleOptions },
  ];
  const editFields: FieldDef[] = [
    { name: "fullName", label: "Nome completo", required: true },
    { name: "phone", label: "Telefone" },
    { name: "licenceNumber", label: "N.º da carta de condução", required: true },
    { name: "defaultVehicleId", label: "Veículo habitual", type: "select", options: vehicleOptions },
  ];
  return (
    <>
      <div className="toolbar">
        <input placeholder="Pesquisar nome, email ou carta…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        {can("fleet.write") && <button className="btn btn-primary" onClick={() => setEditing("new")}>Novo motorista</button>}
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Nome</th><th>Contacto</th><th>Carta</th><th>Veículo habitual</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.fullName}</strong><DemoTag show={d.isDemo} /></td>
                <td className="small">{d.email}<br />{d.phone ?? ""}</td>
                <td>{d.licenceNumber}</td>
                <td>{d.defaultVehiclePlate ?? "—"}</td>
                <td>{d.status === "active" ? <Badge tone="success">Activo</Badge> : <Badge tone="danger">Desactivado</Badge>}</td>
                <td className="actions-cell">
                  {can("fleet.write") && (
                    <>
                      <button className="btn btn-sm" onClick={() => setEditing(d)}>Editar</button>{" "}
                      <button className="btn btn-sm" onClick={() => setToggling(d)}>{d.status === "active" ? "Desactivar" : "Reactivar"}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {editing && (
        <Modal title={editing === "new" ? "Novo motorista" : "Editar motorista"} onClose={() => setEditing(null)}>
          <EntityForm
            fields={editing === "new" ? createFields : editFields}
            initial={editing === "new" ? {} : editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              const body = { ...v, phone: v.phone || undefined };
              if (editing === "new") await api("/admin/drivers", { method: "POST", body });
              else await api(`/admin/drivers/${editing.id}`, { method: "PATCH", body });
              setEditing(null);
              list.reload();
            }}
          />
        </Modal>
      )}
      {toggling && (
        <ConfirmModal
          title={toggling.status === "active" ? "Desactivar motorista" : "Reactivar motorista"}
          message={toggling.status === "active" ? `${toggling.fullName} deixa de conseguir entrar e as sessões abertas terminam. O histórico mantém-se.` : `${toggling.fullName} volta a poder entrar na aplicação.`}
          danger={toggling.status === "active"}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            await api(`/admin/drivers/${toggling.id}`, { method: "PATCH", body: { status: toggling.status === "active" ? "disabled" : "active" } });
            list.reload();
          }}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------ Ocorrências

interface Incident { id: string; kind: IncidentKind; description: string; status: IncidentStatus; tripId: string | null; resolutionNote: string | null; createdAt: string; reporterName: string; reporterRole: string }

export function IncidentsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Incident | null>(null);
  const list = useLoad(() => api<Page<Incident>>(`/admin/incidents${qs({ status, page })}`), [status, page]);
  return (
    <>
      <PageHeader title="Ocorrências" subtitle="Atrasos, avarias, reclamações e questões de segurança reportadas por estudantes e motoristas." />
      <div className="toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Em aberto</option>
          {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{LABELS.incidentStatus[s]}</option>)}
        </select>
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0} empty="Sem ocorrências neste estado.">
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Reportada por</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((i) => (
              <tr key={i.id}>
                <td className="small">{formatDateTime(i.createdAt)}</td>
                <td>{LABELS.incidentKind[i.kind]}</td>
                <td>{i.description}</td>
                <td className="small">{i.reporterName}</td>
                <td><Badge tone={i.status === "resolved" || i.status === "closed" ? "success" : "warning"}>{LABELS.incidentStatus[i.status]}</Badge></td>
                <td className="actions-cell">{can("incidents.manage") && <button className="btn btn-sm" onClick={() => setEditing(i)}>Tratar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {editing && (
        <Modal title="Tratar ocorrência" onClose={() => setEditing(null)}>
          <p>{editing.description}</p>
          <EntityForm
            fields={[
              { name: "status", label: "Estado", type: "select", required: true, options: INCIDENT_STATUSES.map((s) => ({ value: s, label: LABELS.incidentStatus[s] })) },
              { name: "resolutionNote", label: "Nota de resolução", type: "textarea", help: "Enviada ao autor quando a ocorrência é marcada como resolvida." },
            ]}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              await api(`/admin/incidents/${editing.id}`, { method: "PATCH", body: { status: v.status, resolutionNote: v.resolutionNote || undefined } });
              setEditing(null);
              list.reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
