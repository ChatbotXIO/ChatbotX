import { checkout, createCustomer, getCustomer, getCustomerPayments, getCustomerSubscriptions, getProduct, getProducts, updateCustomer } from "@/lib/stripe";
import { useState, useCallback } from "react";
import Stripe from "stripe";

interface UseBillingState {
  loading: boolean;
  error: string | null;
}

export function useBilling({ baseUrl }: { baseUrl?: string } = {}) {
  const resolvedBaseUrl =
    baseUrl ? baseUrl : '/';

  const [state, setState] = useState<UseBillingState>({
    loading: false,
    error: null,
  });

  const [products, setProducts] = useState<Stripe.Response<Stripe.ApiList<Stripe.Product>> | null>(null);
  const [customer, setCustomer] = useState<Stripe.Customer | null>(null);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const handleAsyncOperation = useCallback(
    async <T>(
      operation: () => Promise<T>,
      operationName: string
    ): Promise<T> => {
      try {
        setLoading(true);
        setError(null);
        const result = await operation();
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : `Failed to ${operationName}`;
        setError(errorMessage);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError]
  );

  const fetchProducts = useCallback(async (): Promise<Stripe.Response<Stripe.ApiList<Stripe.Product>>> => {
    const result = await handleAsyncOperation(
      () => getProducts({ baseUrl: resolvedBaseUrl }),
      "fetch products"
    );
    setProducts(result);
    return result;
  }, [handleAsyncOperation, resolvedBaseUrl]);

  const fetchProduct = useCallback(
    async (product_id: string): Promise<Stripe.Product> => {
      return handleAsyncOperation(
        () => getProduct({ baseUrl: resolvedBaseUrl, product_id }),
        "fetch product"
      );
    },
    [handleAsyncOperation, resolvedBaseUrl]
  );

  const fetchCustomer = useCallback(
    async (customer_id: string): Promise<Stripe.Customer> => {
      const result = await handleAsyncOperation(
        () => getCustomer({ baseUrl: resolvedBaseUrl, customer_id }),
        "fetch customer"
      );
      setCustomer(result);
      return result;
    },
    [handleAsyncOperation, resolvedBaseUrl]
  );

  const fetchCustomerSubscriptions = useCallback(
    async (customer_id: string): Promise<Stripe.Response<Stripe.ApiList<Stripe.Subscription>>> => {
      return handleAsyncOperation(
        () =>
          getCustomerSubscriptions({ baseUrl: resolvedBaseUrl, customer_id }),
        "fetch customer subscriptions"
      );
    },
    [handleAsyncOperation, resolvedBaseUrl]
  );

  const fetchCustomerPayments = useCallback(
    async (customer_id: string): Promise<Stripe.PaymentIntent[]> => {
      return handleAsyncOperation(
        () => getCustomerPayments({ baseUrl: resolvedBaseUrl, customer_id }),
        "fetch customer payments"
      );
    },
    [handleAsyncOperation, resolvedBaseUrl]
  );

  const createNewCustomer = useCallback(
    async (
      newCustomer: { email: string; name: string; phone_number?: string | null }
    ): Promise<Stripe.Customer> => {
      const result = await handleAsyncOperation(
        () =>
          createCustomer({ baseUrl: resolvedBaseUrl, customer: newCustomer }),
        "create customer"
      );
      setCustomer(result);
      return result;
    },
    [handleAsyncOperation, resolvedBaseUrl]
  );

  const updateExistingCustomer = useCallback(
    async (
      customer_id: string,
      updatedCustomer: { name?: string | null; phone_number?: string | null }
    ): Promise<Stripe.Customer> => {
      const result = await handleAsyncOperation(
        () =>
          updateCustomer({
            baseUrl: resolvedBaseUrl,
            customer_id,
            customer: updatedCustomer,
          }),
        "update customer"
      );
      setCustomer(result);
      return result;
    },
    [handleAsyncOperation, resolvedBaseUrl]
  );

  const createCheckout = useCallback(
    async (
      productCart: Array<{ name: string; quantity: number; amount: number }>,
      customer: { email: string; name: string },
      return_url: string,
      metadata?: Record<string, string>
    ): Promise<{ url: string }> => {
      return handleAsyncOperation(
        () =>
          checkout({
            baseUrl: resolvedBaseUrl,
            productCart,
            customer,
            return_url,
            metadata,
          }),
        "create checkout"
      );
    },
    [handleAsyncOperation, resolvedBaseUrl]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  return {
    loading: state.loading,
    error: state.error,
    products,
    customer,
    clearError,
    fetchProducts,
    fetchProduct,
    fetchCustomer,
    fetchCustomerSubscriptions,
    fetchCustomerPayments,
    createNewCustomer,
    updateExistingCustomer,
    createCheckout,
  };
}
