export function numberOrExisting(value, existingValue) {
  const selected = value !== undefined && value !== '' ? value : existingValue;
  return Number(selected === undefined || selected === null ? 0 : selected);
}

export function normalizeInvoiceLineAmount(line) {
  const rawAmount = [line?.amount, line?.total]
    .find((value) => value !== undefined && value !== null && value !== '');
  return {
    amount: rawAmount === undefined ? undefined : Number(rawAmount),
    manualAmount: line?.manualAmount === true
  };
}

export function invoiceLineAmount(line) {
  const quantity = Number(line?.qty ?? 0);
  const rate = Number(line?.rate ?? 0);
  if (line?.manualAmount === true) return Number(line.amount ?? 0);
  const rawAmount = [line?.amount, line?.total]
    .find((value) => value !== undefined && value !== null && value !== '');
  return rawAmount === undefined ? quantity * rate : Number(rawAmount);
}
