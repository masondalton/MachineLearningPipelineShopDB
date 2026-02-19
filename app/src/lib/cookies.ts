/**
 * Simple cookie helpers for persisting selected customer.
 */

const CUSTOMER_ID_KEY = "selected_customer_id";
const COOKIE_MAX_AGE_DAYS = 7;

export function getCustomerIdFromCookie(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CUSTOMER_ID_KEY}=([^;]*)`)
  );
  const val = match ? decodeURIComponent(match[1]) : null;
  if (!val) return null;
  const id = parseInt(val, 10);
  return isNaN(id) ? null : id;
}

export function setCustomerIdCookie(customerId: number | null): void {
  if (typeof document === "undefined") return;
  if (customerId === null) {
    document.cookie = `${CUSTOMER_ID_KEY}=; path=/; max-age=0`;
    return;
  }
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${CUSTOMER_ID_KEY}=${customerId}; path=/; max-age=${maxAge}; SameSite=Lax`;
}
