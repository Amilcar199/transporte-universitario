// Teste de aceitação da app (versão web do Expo) para estudante e motorista, num browser real.
//
// Usa contas e dados de demonstração existentes: a estudante tem de ter a inscrição universitária confirmada e numa
// das rotas indicadas tem de haver viagens. O pagamento usa o ambiente de testes (sandbox), que não movimenta dinheiro
// e não existe em produção. Só corre contra localhost.
//
//   E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD   estudante verificada (obrigatórias)
//   E2E_DRIVER_EMAIL / E2E_DRIVER_PASSWORD     motorista com viagem hoje na rota (opcionais)
//   E2E_ROUTE_CODE (VIA-TAL), APP_URL (http://localhost:8081), API_URL (http://localhost:4000/api/v1)
//   E2E_BROWSER_CHANNEL (chrome), E2E_HEADED=1

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const APP_URL = process.env.APP_URL ?? "http://localhost:8081";
const API_URL = process.env.API_URL ?? "http://localhost:4000/api/v1";
const ROUTE_CODE = process.env.E2E_ROUTE_CODE ?? "VIA-TAL";
const { E2E_STUDENT_EMAIL, E2E_STUDENT_PASSWORD, E2E_DRIVER_EMAIL, E2E_DRIVER_PASSWORD } = process.env;

for (const url of [APP_URL, API_URL]) {
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
    console.error(`Recusado: ${url} não é local.`);
    process.exit(2);
  }
}
if (!E2E_STUDENT_EMAIL || !E2E_STUDENT_PASSWORD) {
  console.error("Defina E2E_STUDENT_EMAIL e E2E_STUDENT_PASSWORD.");
  process.exit(2);
}

const results = [];
async function step(name, fn) {
  try {
    const note = await fn();
    results.push({ name, status: note?.skipped ? "skip" : "ok" });
    console.log(`${note?.skipped ? "SALTO" : "OK   "} ${name}${note?.text ? `\n      ${note.text}` : ""}`);
  } catch (err) {
    results.push({ name, status: "fail" });
    console.log(`FALHA ${name}\n      ${String(err?.message ?? err).split("\n")[0]}`);
    throw err;
  }
}

const button = (page, name) => page.getByRole("button", { name, exact: true });

async function login(page, email, password) {
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Palavra-passe", { exact: true }).fill(password);
  await button(page, "Entrar").click();
}

/** Espera pelo primeiro de vários localizadores visíveis e devolve o seu índice. */
async function firstVisible(locators, timeout = 15000) {
  return Promise.any(locators.map((l, i) => l.filter({ visible: true }).first().waitFor({ state: "visible", timeout }).then(() => i)));
}

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome", headless: process.env.E2E_HEADED !== "1" });
const pages = [];
async function newPhone(options = {}) {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: "pt-PT", ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  pages.push(page);
  return page;
}

try {
  const student = await newPhone();
  let requiresBooking = null;
  let passToken = null;

  await step("Estudante inicia sessão e chega à área de estudante", async () => {
    await login(student, E2E_STUDENT_EMAIL, E2E_STUDENT_PASSWORD);
    await student.waitForURL(/\/student/);
  });

  await step("Plano activo (subscrição e pagamento de teste confirmado pelo servidor, se necessário)", async () => {
    await student.goto(`${APP_URL}/student/plans`);
    const active = student.getByText("Activa", { exact: true });
    const choose = button(student, "Escolher este plano");
    const pay = student.getByRole("button", { name: /Pagamento de teste \(sem dinheiro real\)/ });
    const simulate = button(student, "Simular pagamento aceite");
    let actions = [];
    for (let i = 0; i < 4; i++) {
      const state = await firstVisible([active, simulate, pay, choose]);
      if (state === 0) break;
      if (state === 1) { await simulate.click(); actions.push("pagamento de teste aceite"); }
      if (state === 2) {
        await pay.first().click();
        await student.getByRole("button", { name: /^Pagar / }).click();
        actions.push("pagamento de teste iniciado");
      }
      if (state === 3) { await choose.first().click(); actions.push("plano escolhido"); }
      await student.waitForTimeout(500);
    }
    await active.first().waitFor();
    return { text: actions.length ? actions.join(" → ") : "já tinha um plano activo" };
  });

  await step("Passe digital mostra um QR renovável e o servidor emite o código", async () => {
    const tokenResponse = student.waitForResponse((r) => r.url().endsWith("/passes/me/token") && r.status() === 200);
    const passResponse = student.waitForResponse((r) => r.url().endsWith("/passes/me") && r.status() === 200);
    await student.goto(`${APP_URL}/student/pass`);
    const pass = await (await passResponse).json();
    requiresBooking = pass.subscription?.requiresBooking ?? null;
    passToken = (await (await tokenResponse).json()).token;
    await student.locator("svg").first().waitFor();
    await student.getByText(/Actualiza em \d\d:\d\d/).waitFor();
    if (passToken.split(".").length !== 3) throw new Error("O código do passe não tem o formato esperado.");
    const payload = JSON.parse(Buffer.from(passToken.split(".")[1], "base64url").toString());
    const allowed = new Set(["pid", "jti", "aud", "iat", "exp", "iss", "sub"]);
    const extra = Object.keys(payload).filter((k) => !allowed.has(k));
    if (extra.length) throw new Error(`O código do passe contém campos inesperados: ${extra.join(", ")}`);
    return { text: `campos do código: ${Object.keys(payload).join(", ")}; plano ${requiresBooking ? "exige" : "não exige"} reserva` };
  });

  await step(`Reservar lugar na ${ROUTE_CODE} para amanhã e impedir reserva duplicada`, async () => {
    await student.goto(`${APP_URL}/student/routes`);
    await student.getByText(new RegExp(`^Rota ${ROUTE_CODE} · `)).first().click();
    const trip = student.getByText(/^Partida às \d\d:\d\d$/).first();
    async function chooseTomorrowTrip() {
      await student.getByText("Reservar lugar").waitFor();
      await button(student, "Hoje").locator("xpath=following-sibling::*[1]").click();
      await trip.waitFor();
      await trip.click();
      await student.getByText("Paragens da rota", { exact: true }).locator("xpath=..").getByRole("button").first().click();
      await button(student, "Confirmar reserva").click();
    }
    await chooseTomorrowTrip();
    const departure = await trip.innerText();
    const success = student.getByText(/Reserva confirmada\. Lugar \d+\./);
    const duplicate = student.getByText("Já tem uma reserva confirmada nesta viagem.");
    const first = await firstVisible([success, duplicate]);
    const firstText = first === 0 ? await success.innerText() : "já existia reserva desta estudante nesta viagem";
    if (first === 0) {
      // Depois de reservar, o ecrã bloqueia a mesma viagem; recarregar repõe o formulário para testar o servidor.
      await student.reload();
      await chooseTomorrowTrip();
      await duplicate.waitFor();
    }
    return { text: `${departure}: ${firstText}; segunda tentativa recusada pelo servidor` };
  });

  await step("A reserva aparece na lista de reservas da estudante", async () => {
    await student.goto(`${APP_URL}/student/bookings`);
    await student.getByText(ROUTE_CODE).first().waitFor();
    await button(student, "Cancelar reserva").first().waitFor();
  });

  if (E2E_DRIVER_EMAIL && E2E_DRIVER_PASSWORD) {
    const driver = await newPhone({ geolocation: { latitude: -8.8383, longitude: 13.2344 }, permissions: ["geolocation"] });
    let tripOpened = false;

    await step("Motorista inicia sessão e vê as viagens atribuídas", async () => {
      await login(driver, E2E_DRIVER_EMAIL, E2E_DRIVER_PASSWORD);
      await driver.waitForURL(/\/driver/);
      await driver.getByText(/^Rota |^Não tem viagens atribuídas/).first().waitFor();
    });

    await step(`Motorista inicia a viagem de hoje na ${ROUTE_CODE} e partilha a localização`, async () => {
      const todaySection = driver.getByText("Hoje", { exact: true });
      const row = todaySection.locator("xpath=../..").getByText(`Rota ${ROUTE_CODE}`, { exact: true }).first();
      if (!(await todaySection.isVisible()) || !(await row.isVisible())) return { skipped: true, text: "sem viagem desta rota hoje para este motorista" };
      await row.click();
      tripOpened = true;
      const start = button(driver, "Iniciar viagem");
      const validate = button(driver, "Validar passe");
      const state = await firstVisible([start, validate, driver.getByText("Concluída", { exact: true })]);
      if (state === 2) return { skipped: true, text: "a viagem de hoje já estava concluída" };
      const locations = driver.waitForResponse((r) => /\/driver\/trips\/[^/]+\/locations$/.test(r.url()), { timeout: 30000 });
      if (state === 0) await start.click();
      await validate.waitFor();
      const res = await locations;
      if (res.status() !== 200) throw new Error(`Envio de localização recusado (${res.status()}).`);
      return { text: `localização aceite pelo servidor: ${JSON.stringify(await res.json())}` };
    });

    if (tripOpened && (await button(driver, "Validar passe").isVisible())) {
      await step("Motorista valida o passe da estudante (código introduzido manualmente)", async () => {
        await button(driver, "Validar passe").click();
        await button(driver, "Introduzir o código manualmente").click();
        await driver.getByLabel("Código do passe").fill(passToken);
        await button(driver, "Validar").click();
        const expected = requiresBooking ? "Reserva necessária" : "Viagem autorizada";
        await driver.getByText(expected, { exact: true }).waitFor();
        let replay = "";
        if (!requiresBooking) {
          await button(driver, "Ler outro").click();
          await button(driver, "Introduzir o código manualmente").click();
          await driver.getByLabel("Código do passe").fill(passToken);
          await button(driver, "Validar").click();
          await button(driver, "Ler outro").waitFor();
          if (await driver.getByText("Viagem autorizada", { exact: true }).isVisible()) throw new Error("O mesmo código foi aceite duas vezes.");
          replay = "; reutilização do mesmo código recusada";
        }
        return { text: `resultado: ${expected} (a reserva é para amanhã)${replay}` };
      });

      await step("Motorista termina a viagem com confirmação", async () => {
        await driver.goBack();
        await button(driver, "Terminar viagem").click();
        await button(driver, "Terminar").click();
        const done = await driver.getByText(/Viagem terminada\. \d+ reserva\(s\) sem embarque\./).innerText();
        return { text: done };
      });
    }
  }
} catch {
  await mkdir("e2e/artifacts", { recursive: true });
  for (const [i, page] of pages.entries()) {
    const shot = `e2e/artifacts/app-falha-${i}.png`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.log(`      Captura: ${shot}`);
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => r.status === "fail").length;
const skipped = results.filter((r) => r.status === "skip").length;
console.log(`\n${results.length - failed - skipped} concluídos, ${skipped} saltados, ${failed} falhados.`);
process.exit(failed ? 1 : 0);
