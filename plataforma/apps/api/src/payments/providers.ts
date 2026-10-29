import { LABELS, type PaymentMethod } from "@uni/shared";
import type { Env } from "../env.ts";

/**
 * Descreve os métodos de pagamento e a sua disponibilidade real.
 *
 * - `manual_review`: o estudante paga fora da plataforma e indica a referência; o financeiro confirma.
 * - `sandbox`: simulação explícita para testes; o evento passa pelo mesmo caminho idempotente de confirmação.
 * - `provider`: integração com um fornecedor autorizado (Multicaixa Express, PayPay). Sem contrato e
 *   credenciais oficiais fica indisponível; nenhuma resposta é simulada.
 */
export type PaymentFlow = "manual_review" | "sandbox" | "provider";

export interface PaymentMethodInfo {
  method: PaymentMethod;
  label: string;
  flow: PaymentFlow;
  available: boolean;
  unavailableReason?: string;
  instructions?: { iban: string; beneficiary: string };
}

export interface PaymentProviders {
  list(): PaymentMethodInfo[];
  get(method: PaymentMethod): PaymentMethodInfo;
}

const PROVIDER_NOT_CONFIGURED =
  "Integração com o fornecedor autorizado ainda não configurada. Utilize outro método de pagamento.";

export function createPaymentProviders(env: Env): PaymentProviders {
  const bankConfigured = env.BANK_TRANSFER_IBAN.trim() !== "" && env.BANK_TRANSFER_BENEFICIARY.trim() !== "";
  const methods: Record<PaymentMethod, PaymentMethodInfo> = {
    bank_transfer: {
      method: "bank_transfer",
      label: LABELS.paymentMethod.bank_transfer,
      flow: "manual_review",
      available: bankConfigured,
      ...(bankConfigured
        ? { instructions: { iban: env.BANK_TRANSFER_IBAN.trim(), beneficiary: env.BANK_TRANSFER_BENEFICIARY.trim() } }
        : { unavailableReason: "Os dados bancários para transferência ainda não foram configurados." }),
    },
    multicaixa_express: {
      method: "multicaixa_express",
      label: LABELS.paymentMethod.multicaixa_express,
      flow: "provider",
      available: false,
      unavailableReason: PROVIDER_NOT_CONFIGURED,
    },
    paypay: {
      method: "paypay",
      label: LABELS.paymentMethod.paypay,
      flow: "provider",
      available: false,
      unavailableReason: PROVIDER_NOT_CONFIGURED,
    },
    sandbox: {
      method: "sandbox",
      label: LABELS.paymentMethod.sandbox,
      flow: "sandbox",
      available: env.PAYMENTS_SANDBOX_ENABLED && env.NODE_ENV !== "production",
      unavailableReason: env.PAYMENTS_SANDBOX_ENABLED ? undefined : "O ambiente de testes de pagamentos está desactivado.",
    },
  };
  return {
    list: () => Object.values(methods),
    get: (method) => methods[method],
  };
}
