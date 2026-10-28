import { api } from "./api";

// PayPal's checkout script, loaded only when someone is about to pay, so no
// other page talks to PayPal. The client ID comes from the server
// (GET /payments/config); it is public by design, the secret never leaves the
// server. The site's security policy allows PayPal's script, frames and popup.

type ButtonsOptions = {
  style?: Record<string, string | number>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
};

export type PayPalButtons = {
  isEligible: () => boolean;
  render: (container: HTMLElement) => Promise<void>;
  close: () => Promise<void>;
};

type PayPalNamespace = { Buttons: (options: ButtonsOptions) => PayPalButtons };

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let loading: Promise<PayPalNamespace> | null = null;

export const loadPayPal = (): Promise<PayPalNamespace> => {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (loading) return loading;

  loading = api<{ clientId: string; currency: string }>("GET", "/payments/config").then(
    ({ clientId, currency }) =>
      new Promise<PayPalNamespace>((resolve, reject) => {
        const params = new URLSearchParams({
          "client-id": clientId,
          currency,
          intent: "capture",
          components: "buttons",
          // PayPal only: no card, Pay Later or Venmo buttons
          "disable-funding": "card,credit,paylater,venmo",
        });
        const script = document.createElement("script");
        script.src = `https://www.paypal.com/sdk/js?${params}`;
        script.async = true;
        script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal didn't load")));
        script.onerror = () => reject(new Error("Can't reach PayPal right now. Please try again."));
        document.head.appendChild(script);
      })
  );
  // A failed load can be tried again later
  loading.catch(() => {
    loading = null;
  });
  return loading;
};
