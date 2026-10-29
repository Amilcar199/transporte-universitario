import { useState } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { Badge, DemoTag, EntityForm, Loader, Modal, PageHeader, useLoad, type FieldDef } from "../ui.tsx";

interface Carrier {
  id: string;
  name: string;
  nif: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
  isDemo: boolean;
  vehicleCount: number;
  validatorCount: number;
}

const fields: FieldDef[] = [
  { name: "name", label: "Nome da transportadora", required: true },
  { name: "nif", label: "NIF", help: "Apenas letras e algarismos (6 a 20)." },
  { name: "contactEmail", label: "Email de contacto", type: "email" },
  { name: "contactPhone", label: "Telefone de contacto" },
  { name: "active", label: "Activa", type: "checkbox", help: "Ao desactivar, os validadores desta transportadora deixam de poder validar passes." },
];

export function PartnersPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<Carrier | "new" | null>(null);
  const list = useLoad(() => api<Carrier[]>("/admin/partners"), []);

  const save = async (values: Record<string, any>) => {
    const body = { name: values.name, nif: values.nif, contactEmail: values.contactEmail, contactPhone: values.contactPhone, active: !!values.active };
    if (editing === "new") await api("/admin/partners", { method: "POST", body });
    else await api(`/admin/partners/${(editing as Carrier).id}`, { method: "PATCH", body });
    setEditing(null);
    list.reload();
  };

  return (
    <>
      <PageHeader
        title="Transportadoras parceiras"
        subtitle="Empresas que operam viagens com veículos próprios. Os seus validadores só validam passes nas viagens desses veículos."
        actions={can("partners.write") && <button className="btn btn-primary" onClick={() => setEditing("new")}>Nova transportadora</button>}
      />
      <div className="alert alert-warning">
        Registe apenas transportadoras com acordo formal assinado. Os registos marcados DEMO são exemplos e não representam parceiros reais.
      </div>
      <Loader {...list} isEmpty={list.data?.length === 0} empty="Ainda não há transportadoras registadas.">
        <table>
          <thead><tr><th>Nome</th><th>NIF</th><th>Contacto</th><th>Veículos</th><th>Validadores</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong><DemoTag show={p.isDemo} /></td>
                <td>{p.nif ?? "—"}</td>
                <td className="small">{[p.contactEmail, p.contactPhone].filter(Boolean).join(" · ") || "—"}</td>
                <td>{p.vehicleCount}</td>
                <td>{p.validatorCount}</td>
                <td>{p.active ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                <td className="actions-cell">{can("partners.write") && <button className="btn btn-sm" onClick={() => setEditing(p)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Loader>
      {editing && (
        <Modal title={editing === "new" ? "Nova transportadora" : "Editar transportadora"} onClose={() => setEditing(null)}>
          <EntityForm fields={fields} initial={editing === "new" ? { active: true } : editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
