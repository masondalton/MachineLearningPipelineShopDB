"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  getCustomerIdFromCookie,
  setCustomerIdCookie,
} from "@/lib/cookies";
import { apiUrl } from "@/lib/api";

export interface Customer {
  customer_id: number;
  full_name: string;
  email: string;
  city: string | null;
  state: string | null;
}

interface CustomerContextType {
  customer: Customer | null;
  setCustomer: (c: Customer | null) => void;
  customers: Customer[];
  loading: boolean;
  error: string | null;
}

const CustomerContext = createContext<CustomerContextType | null>(null);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomerState] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setCustomer = useCallback((c: Customer | null) => {
    setCustomerState(c);
    setCustomerIdCookie(c?.customer_id ?? null);
  }, []);

  useEffect(() => {
    setError(null);
    fetch(apiUrl("/customers"))
      .then((r) => {
        if (!r.ok) {
          throw new Error(`API error: ${r.status} ${r.statusText}`);
        }
        return r.json();
      })
      .then((data: unknown) => {
        const list = Array.isArray(data) ? data : [];
        setCustomers(list);
        const savedId = getCustomerIdFromCookie();
        if (savedId) {
          const found = list.find((d) => d.customer_id === savedId);
          if (found) setCustomerState(found);
        }
      })
      .catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load customers");
        setCustomers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <CustomerContext.Provider
      value={{ customer, setCustomer, customers, loading, error }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used within CustomerProvider");
  return ctx;
}
