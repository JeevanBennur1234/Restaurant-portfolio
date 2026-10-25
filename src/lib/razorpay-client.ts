/**
 * Client-side loader for Razorpay Checkout script
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    // Check if script element already exists
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existingScript) {
      if (window.Razorpay) {
        resolve(true);
      } else {
        existingScript.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
        existingScript.addEventListener("error", () => resolve(false), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
