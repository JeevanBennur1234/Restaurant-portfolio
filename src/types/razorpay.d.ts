export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  order_id: string;
  handler: (response: RazorpaySuccessResponse) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
  config?: {
    display?: {
      blocks?: Record<
        string,
        {
          name: string;
          instruments: Array<{
            method: string;
            flows?: string[];
            apps?: string[];
            banks?: string[];
            wallets?: string[];
          }>;
        }
      >;
      sequence?: string[];
      preferences?: {
        show_default_blocks?: boolean;
      };
      hide?: Array<{
        method: string;
      }>;
    };
  };
}

export interface RazorpayFailureResponse {
  error?: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: {
      order_id?: string;
      payment_id?: string;
    };
  };
}

export interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: RazorpayFailureResponse) => void): void;
  on(event: string, handler: (response: unknown) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}
