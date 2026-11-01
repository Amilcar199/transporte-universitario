// Teste de aceitação do painel administrativo, conduzido num browser real (Chrome do sistema).
//
// Cria registos de teste na base de dados da API indicada (marcados "E2E" no nome). Por segurança só corre contra
// localhost. As credenciais vêm de variáveis de ambiente e nunca ficam no repositório.
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD    conta com perfil de administrador geral (obrigatórias)
//   E2E_DRIVER_EMAIL / E2E_DRIVER_PASSWORD  conta de motorista para confirmar o bloqueio (opcionais)
//   ADMIN_URL (http://localhost:5173), API_URL (http://localhost:4000/api/v1)
//   E2E_BROWSER_CHANNEL (chrome; também aceita msedge), E2E_HEADED=1 para ver o browser

import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";

const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://localhost:4000/api/v1";
const { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_DRIVER_EMAIL, E2E_DRIVER_PASSWORD } = process.env;

for (const url of [ADMIN_URL, API_URL]) {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error(`Recusado: ${url} não é local. Este teste cria registos e só corre contra um ambiente local.`);
    process.exit(2);
  }
}
if (!E2E_ADMIN_EMAIL || !E2E_ADMIN_PASSWORD) {
  console.error("Defina E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD.");
  process.exit(2);
}

const suffix = randomBytes(3).toString("hex").toUpperCase();
const uni = { name: `Universidade E2E ${suffix}`, short: `E2E${suffix}` };
const pickupStop = `Paragem E2E ${suffix}`;
const campusStop = `Campus E2E ${suffix}`;
const routeCode = `E2E-${suffix}`;
const intercityCode = `E2I-${suffix}`;
const plate = `E2E-${suffix}`;
const driverName = `Motorista E2E ${suffix}`;

/** Próximo dia útil (segunda a sexta) a partir de amanhã, no fuso de Luanda. */
function nextWeekday() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Luanda" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
const serviceDate = nextWeekday();

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`OK    ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`FALHA ${name}\n      ${String(err?.message ?? err).split("\n")[0]}`);
    throw err;
  }
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Campo de um EntityForm pelo texto exacto do rótulo (com ou sem asterisco de obrigatório). */
function field(scope, label) {
  return scope
    .locator("label.field")
    .filter({ has: scope.page().locator("span", { hasText: new RegExp(`^${escape(label)}( \\*)?$`) }) })
    .locator("input, select, textarea")
    .first();
}

async function selectByText(select, text) {
  await select.locator("option", { hasText: text }).first().waitFor({ state: "attached" });
  const value = await select.evaluate((el, t) => [...el.options].find((o) => o.textContent.includes(t))?.value, text);
  if (!value) throw new Error(`Opção "${text}" não encontrada.`);
  await select.selectOption(value);
}

/** Submete o formulário do modal e espera que feche; se o servidor recusar, devolve a mensagem de erro. */
async function submitModal(modal, label = "Guardar") {
  await modal.getByRole("button", { name: label, exact: true }).click();
  const error = modal.locator(".alert-danger");
  const outcome = await Promise.race([
    modal.waitFor({ state: "detached", timeout: 15000 }).then(() => null),
    error.waitFor({ state: "visible", timeout: 15000 }).then(() => error.innerText()),
  ]);
  return outcome;
}

async function mustSubmit(modal, label) {
  const error = await submitModal(modal, label);
  if (error) throw new Error(`O servidor recusou: ${error}`);
}

async function login(page, email, password) {
  await page.goto(ADMIN_URL);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Palavra-passe").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function apiLogin(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, deviceLabel: "e2e" }),
  });
  if (!res.ok) throw new Error(`Login na API falhou (${res.status}).`);
  return (await res.json()).accessToken;
}

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome", headless: process.env.E2E_HEADED !== "1" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-PT" });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const modal = page.locator(".modal-backdrop");

try {
  if (E2E_DRIVER_EMAIL && E2E_DRIVER_PASSWORD) {
    await step("Motorista é recusado no painel", async () => {
      await login(page, E2E_DRIVER_EMAIL, E2E_DRIVER_PASSWORD);
      await page.getByText("Esta conta não tem acesso ao painel administrativo.").waitFor();
    });
  }

  await step("Administrador inicia sessão", async () => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await page.getByRole("heading", { name: "Visão geral" }).waitFor();
  });

  await step(`Criar universidade ${uni.short}`, async () => {
    await page.getByRole("link", { name: "Universidades" }).click();
    await page.getByRole("button", { name: "Nova universidade" }).click();
    await field(modal, "Nome").fill(uni.name);
    await field(modal, "Sigla").fill(uni.short);
    await mustSubmit(modal);
    await page.getByRole("cell", { name: uni.short }).waitFor();
  });

  await step("Sigla de universidade duplicada é recusada", async () => {
    await page.getByRole("button", { name: "Nova universidade" }).click();
    await field(modal, "Nome").fill(`${uni.name} (duplicada)`);
    await field(modal, "Sigla").fill(uni.short);
    const error = await submitModal(modal);
    if (!error?.includes("Já existe uma universidade com esta sigla")) throw new Error(`Mensagem inesperada: ${error}`);
    await modal.getByRole("button", { name: "Cancelar" }).click();
  });

  await step("Criar paragem de embarque e destino (campus)", async () => {
    await page.getByRole("link", { name: "Paragens" }).click();
    await page.getByRole("button", { name: "Nova paragem" }).click();
    await field(modal, "Nome").fill(pickupStop);
    await field(modal, "Tipo").selectOption("pickup");
    await field(modal, "Cidade").fill("Luanda");
    await field(modal, "Latitude").fill("-8.8800");
    await field(modal, "Longitude").fill("13.2900");
    await mustSubmit(modal);

    await page.getByRole("button", { name: "Nova paragem" }).click();
    await field(modal, "Nome").fill(campusStop);
    await field(modal, "Tipo").selectOption("destination");
    await selectByText(field(modal, "Universidade"), uni.short);
    await field(modal, "Cidade").fill("Luanda");
    await field(modal, "Latitude").fill("-8.9200");
    await field(modal, "Longitude").fill("13.1900");
    await mustSubmit(modal);
  });

  let routeUrl = "";
  await step(`Criar rota ${routeCode} com paragens ordenadas e horário, e activá-la`, async () => {
    await page.getByRole("link", { name: "Rotas", exact: true }).click();
    await page.getByRole("button", { name: "Nova rota" }).click();
    await field(modal, "Código").fill(routeCode);
    await field(modal, "Nome").fill(`Rota E2E ${suffix}`);
    await field(modal, "Tipo de serviço").selectOption("university");
    await field(modal, "Sentido").selectOption("to_university");
    await modal.locator("label.check", { hasText: uni.short }).locator("input").check();
    await mustSubmit(modal, "Criar rascunho");
    await page.waitForURL(/\/rotas\/[0-9a-f-]{36}$/);
    routeUrl = page.url();

    await page.getByRole("button", { name: "Alterar paragens" }).click();
    const add = page.locator("select").filter({ has: page.locator("option", { hasText: "Adicionar paragem…" }) });
    await selectByText(add, pickupStop);
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await selectByText(add, campusStop);
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page.getByRole("button", { name: "Guardar paragens" }).click();
    await page.getByRole("button", { name: "Alterar paragens" }).waitFor();
    const order = await page.locator(".stop-list li .grow").allInnerTexts();
    if (order.join("|") !== `${pickupStop}|${campusStop}`) throw new Error(`Ordem inesperada: ${order.join(" → ")}`);

    await page.getByRole("button", { name: "Novo horário" }).click();
    await field(modal, "Hora de partida").fill("07:15");
    await mustSubmit(modal);
    await page.getByRole("cell", { name: "07:15" }).waitFor();

    await page.getByRole("button", { name: "Activar" }).click();
    await modal.getByRole("button", { name: "Activar" }).click();
    await page.locator(".route-editor .card-head .badge", { hasText: "Activa" }).waitFor();
  });

  await step(`Criar rota intercidades ${intercityCode} (sem sentido nem universidades)`, async () => {
    await page.getByRole("link", { name: "Rotas", exact: true }).click();
    await page.getByRole("button", { name: "Nova rota" }).click();
    await field(modal, "Código").fill(intercityCode);
    await field(modal, "Nome").fill(`Intercidades E2E ${suffix}`);
    await field(modal, "Tipo de serviço").selectOption("intercity");
    if (await field(modal, "Sentido").count()) throw new Error("O campo Sentido devia estar escondido.");
    await mustSubmit(modal, "Criar rascunho");
    await page.waitForURL(/\/rotas\/[0-9a-f-]{36}$/);
    await page.locator(".route-editor p", { hasText: "Intercidades" }).waitFor();
  });

  await step(`Criar veículo ${plate} e recusar matrícula duplicada`, async () => {
    await page.getByRole("link", { name: "Veículos e motoristas" }).click();
    await page.getByRole("button", { name: "Novo veículo" }).click();
    await field(modal, "Matrícula").fill(plate);
    await field(modal, "Modelo").fill("Autocarro de teste E2E");
    await field(modal, "Lugares para passageiros").fill("20");
    await field(modal, "Estado").selectOption("active");
    await mustSubmit(modal);
    await page.getByRole("cell", { name: plate }).waitFor();

    await page.getByRole("button", { name: "Novo veículo" }).click();
    await field(modal, "Matrícula").fill(plate.toLowerCase());
    await field(modal, "Modelo").fill("Duplicado");
    await field(modal, "Lugares para passageiros").fill("10");
    await field(modal, "Estado").selectOption("active");
    const error = await submitModal(modal);
    if (!error?.includes("Já existe um veículo com esta matrícula")) throw new Error(`Mensagem inesperada: ${error}`);
    await modal.getByRole("button", { name: "Cancelar" }).click();
  });

  await step(`Criar motorista ${driverName}`, async () => {
    await page.getByRole("button", { name: "Motoristas", exact: true }).click();
    await page.getByRole("button", { name: "Novo motorista" }).click();
    await field(modal, "Nome completo").fill(driverName);
    await field(modal, "Email").fill(`motorista.e2e.${suffix.toLowerCase()}@demo.unirota.invalid`);
    await field(modal, "N.º da carta de condução").fill(`E2E${suffix}`);
    await field(modal, "Palavra-passe temporária").fill(`E2e-${randomBytes(9).toString("base64url")}`);
    await mustSubmit(modal);
    await page.getByRole("cell", { name: driverName }).waitFor();
  });

  await step(`Atribuir veículo e motorista à viagem de ${serviceDate} às 07:15`, async () => {
    await page.getByRole("link", { name: "Viagens e atribuições" }).click();
    await page.getByRole("button", { name: "Nova atribuição" }).click();
    await selectByText(modal.locator("label.field", { hasText: "Rota" }).locator("select").first(), routeCode);
    await selectByText(field(modal, "Horário"), "07:15");
    await field(modal, "Data").fill(serviceDate);
    await selectByText(field(modal, "Veículo"), plate);
    await selectByText(field(modal, "Motorista"), driverName);
    await mustSubmit(modal, "Atribuir");
  });

  await step("Os registos persistem depois de recarregar a página", async () => {
    await page.reload();
    await page.getByLabel("Data").fill(serviceDate);
    const row = page.locator("tr", { hasText: routeCode });
    await row.waitFor();
    const text = await row.innerText();
    for (const expected of ["07:15", plate, driverName, "0 / 20"]) {
      if (!text.includes(expected)) throw new Error(`A linha da viagem não contém "${expected}": ${text}`);
    }
    await page.getByRole("link", { name: "Rotas", exact: true }).click();
    const routeRow = page.locator("tr", { hasText: routeCode });
    await routeRow.waitFor();
    const cells = await routeRow.locator("td").allInnerTexts();
    const [, universitiesCell, stopsCell, schedulesCell] = cells.map((c) => c.trim());
    if (universitiesCell !== uni.short || stopsCell !== "2" || schedulesCell !== "1") {
      throw new Error(`Lista de rotas com dados errados: ${cells.join(" | ")}`);
    }
    await page.goto(routeUrl);
    await page.locator(".route-editor .card-head .badge", { hasText: "Activa" }).waitFor();
    await page.getByRole("cell", { name: "07:15" }).waitFor();
    const order = await page.locator(".stop-list li .grow").allInnerTexts();
    if (order.join("|") !== `${pickupStop}|${campusStop}`) throw new Error(`Ordem inesperada após recarregar: ${order.join(" → ")}`);
  });

  await step("Auditoria regista as operações", async () => {
    await page.getByRole("link", { name: "Auditoria" }).click();
    await page.locator("tbody tr").first().waitFor();
    const text = await page.locator("tbody").innerText();
    if (!/trip|viagem/i.test(text)) throw new Error("Não encontrei o registo de auditoria da atribuição.");
  });

  await step("Páginas de transportadoras parceiras e relatórios carregam dados do servidor", async () => {
    await page.getByRole("link", { name: "Transportadoras parceiras" }).click();
    await page.getByText("Registe apenas transportadoras com acordo formal").waitFor();
    await page.getByRole("link", { name: "Relatórios" }).click();
    await page.getByRole("heading", { name: "Ocupação por rota" }).waitFor();
  });

  await step("A API recusa pedidos sem sessão (401) e de perfis sem permissão (403)", async () => {
    const anonymous = await fetch(`${API_URL}/admin/universities`);
    if (anonymous.status !== 401) throw new Error(`Sem sessão: esperado 401, obtido ${anonymous.status}.`);
    if (E2E_DRIVER_EMAIL && E2E_DRIVER_PASSWORD) {
      const token = await apiLogin(E2E_DRIVER_EMAIL, E2E_DRIVER_PASSWORD);
      const res = await fetch(`${API_URL}/admin/universities`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "Não autorizada", shortName: `X${suffix}`, city: "Luanda" }),
      });
      if (res.status !== 403) throw new Error(`Motorista: esperado 403, obtido ${res.status}.`);
    }
  });
} catch {
  await mkdir("e2e/artifacts", { recursive: true });
  const shot = `e2e/artifacts/falha-${suffix}.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.log(`      Captura: ${shot}`);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passos concluídos${failed ? "; o teste parou na primeira falha" : ""}. Sufixo dos registos: ${suffix}`);
process.exit(failed ? 1 : 0);
