import { apiRequest } from './api';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export type PaymentBillingCycle = 'monthly' | 'semi_annual' | 'annual';

export interface PaymentOrder {
  _id: string;
  userId: string;
  orderCode: number;
  planType: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
  billingCycle: PaymentBillingCycle;
  durationDays: number;
  amount: number;
  status: PaymentStatus;
  checkoutUrl: string | null;
  paymentLinkId: string | null;
  description: string | null;
  transactionReference: string | null;
  counterAccountBankName: string | null;
  counterAccountName: string | null;
  counterAccountNumber: string | null;
  paidAt: string | null;
  expiresAt: string;
  vatInvoiceRequested: boolean;
  vatCompanyName: string | null;
  vatTaxCode: string | null;
  vatAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentOrderInput {
  planType: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
  billingCycle: PaymentBillingCycle;
  vatInvoiceRequested?: boolean;
  vatCompanyName?: string;
  vatTaxCode?: string;
  vatAddress?: string;
}

export interface CreatePaymentOrderResult {
  checkoutUrl: string;
  orderCode: number;
  amount: number;
  planType: 'CANDIDATE_PREMIUM' | 'HR_PREMIUM';
  billingCycle: PaymentBillingCycle;
  expiresAt: string;
}

export const paymentApi = {
  createPaymentOrder: async (
    accessToken: string,
    input: CreatePaymentOrderInput,
  ): Promise<CreatePaymentOrderResult> => {
    return apiRequest<CreatePaymentOrderResult>('/payments/create-order', {
      method: 'POST',
      accessToken,
      body: input,
    });
  },

  getPaymentHistory: async (
    accessToken: string,
  ): Promise<PaymentOrder[]> => {
    return apiRequest<PaymentOrder[]>('/payments/history', {
      method: 'GET',
      accessToken,
    });
  },

  cancelPaymentOrder: async (
    accessToken: string,
    orderCode: number,
  ): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/payments/${orderCode}`, {
      method: 'DELETE',
      accessToken,
    });
  },

  expirePaymentOrder: async (
    accessToken: string,
    orderCode: number,
  ): Promise<{ message: string; status?: PaymentStatus }> => {
    return apiRequest<{ message: string; status?: PaymentStatus }>(
      `/payments/${orderCode}/expire`,
      {
        method: 'POST',
        accessToken,
      },
    );
  },
};
