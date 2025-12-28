import { useState, useEffect } from "react";
import { getSavedCurrency, saveCurrency, FiatCurrency } from "@/lib/currency";

export const useCurrency = () => {
  const [currency, setCurrencyState] = useState<FiatCurrency>("usd");

  useEffect(() => {
    // Load initial currency on mount
    setCurrencyState(getSavedCurrency());
  }, []);

  const setCurrency = (newCurrency: FiatCurrency) => {
    setCurrencyState(newCurrency);
    saveCurrency(newCurrency);
  };

  return { currency, setCurrency };
};
