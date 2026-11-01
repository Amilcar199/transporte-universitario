import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { WEEKDAY_LABELS, WEEKDAYS } from "@uni/shared";
import { ApiError } from "./api.ts";

// ------------------------------------------------------------ Carregamento de dados

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    load()
      .then((d) => id === seq.current && setData(d))
      .catch((e: unknown) => id === seq.current && setError(e instanceof Error ? e.message : "Erro ao carregar."))
      .finally(() => id === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { data, error, loading, reload: run };
}

export function Loader({ data, error, loading, children, empty, isEmpty }: {
  data: unknown;
  error: string | null;
  loading: boolean;
  children: ReactNode;
  empty?: string;
  isEmpty?: boolean;
}) {
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (loading && data === null) return <div className="muted pad">A carregar…</div>;
  if (isEmpty) return <div className="empty">{empty ?? "Ainda não existem registos."}</div>;
  return <>{children}</>;
}

// ------------------------------------------------------------ Estrutura

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="actions">{actions}</div>
    </header>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function DemoTag({ show }: { show?: boolean }) {
  return show ? <span className="badge badge-demo" title="Registo de demonstração">DEMO</span> : null;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Confirmação explícita para acções destrutivas ou irreversíveis, opcionalmente com motivo obrigatório. */
export function ConfirmModal({ title, message, confirmLabel = "Confirmar", danger, requireReason, onConfirm, onClose }: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireReason?: string;
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div>{message}</div>
        {requireReason && (
          <label className="field">
            <span>{requireReason}</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} rows={3} />
          </label>
        )}
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Voltar</button>
          <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy || (!!requireReason && reason.trim().length < 3)}>
            {busy ? "A processar…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <div className="muted small pad-y">{total} registo(s)</div>;
  return (
    <div className="pagination">
      <span className="muted small">{total} registo(s)</span>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
      <span className="small">Página {page} de {pages}</span>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Seguinte</button>
    </div>
  );
}

// ------------------------------------------------------------ Formulários

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "select" | "checkbox" | "textarea" | "time" | "date" | "multiselect" | "weekdays";
  options?: { value: string; label: string }[];
  required?: boolean;
  help?: string;
  placeholder?: string;
  step?: string;
  hidden?: (values: Record<string, any>) => boolean;
};

export function EntityForm({ fields, initial, onSubmit, onCancel, submitLabel = "Guardar" }: {
  fields: FieldDef[];
  initial?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = {};
    for (const f of fields) v[f.name] = initial?.[f.name] ?? (f.type === "checkbox" ? false : f.type === "multiselect" || f.type === "weekdays" ? [] : "");
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const out: Record<string, any> = {};
    for (const f of fields) {
      if (f.hidden?.(values)) continue;
      const v = values[f.name];
      if (f.type === "number") out[f.name] = v === "" ? undefined : Number(v);
      else if (f.type === "select") out[f.name] = v === "" ? null : v;
      else out[f.name] = v;
    }
    try {
      await onSubmit(out);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setFormError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="form-grid">
        {fields.filter((f) => !f.hidden?.(values)).map((f) => (
          <label key={f.name} className={`field ${f.type === "textarea" || f.type === "multiselect" || f.type === "weekdays" ? "span-2" : ""} ${f.type === "checkbox" ? "field-check" : ""}`}>
            <span>{f.label}{f.required && " *"}</span>
            {renderInput(f, values[f.name], (v) => set(f.name, v))}
            {f.help && <small className="muted">{f.help}</small>}
            {errors[f.name] && <small className="error">{errors[f.name]}</small>}
          </label>
        ))}
      </div>
      {formError && <div className="alert alert-danger">{formError}</div>}
      <div className="form-actions">
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancelar</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "A guardar…" : submitLabel}</button>
      </div>
    </form>
  );
}

function renderInput(f: FieldDef, value: any, onChange: (v: unknown) => void) {
  switch (f.type) {
    case "checkbox":
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case "textarea":
      return <textarea rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
    case "select":
      return (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={f.required}>
          <option value="">— Seleccione —</option>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "multiselect":
      return (
        <div className="checks">
          {f.options?.map((o) => (
            <label key={o.value} className="check">
              <input
                type="checkbox"
                checked={(value as string[]).includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...value, o.value] : (value as string[]).filter((x) => x !== o.value))}
              />
              {o.label}
            </label>
          ))}
          {!f.options?.length && <span className="muted small">Sem opções disponíveis.</span>}
        </div>
      );
    case "weekdays":
      return (
        <div className="checks">
          {WEEKDAYS.map((d) => (
            <label key={d} className="check">
              <input
                type="checkbox"
                checked={(value as number[]).includes(d)}
                onChange={(e) => onChange(e.target.checked ? [...value, d] : (value as number[]).filter((x) => x !== d))}
              />
              {WEEKDAY_LABELS[d]}
            </label>
          ))}
        </div>
      );
    default:
      return (
        <input
          type={f.type ?? "text"}
          value={value ?? ""}
          step={f.step}
          placeholder={f.placeholder}
          required={f.required}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Luanda" }).format(new Date(value));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}
