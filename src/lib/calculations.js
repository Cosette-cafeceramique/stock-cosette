export function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function money(value) {
  return `${toNumber(value).toFixed(2).replace('.', ',')} €`
}

export function percent(value) {
  return `${toNumber(value).toFixed(1).replace('.', ',')} %`
}

export function priceHT(item, overrideTTC = null) {
  const ttc = overrideTTC === null ? toNumber(item.price_ttc) : toNumber(overrideTTC)
  const vat = toNumber(item.sale_vat_rate, 20)
  return ttc / (1 + vat / 100)
}

export function vatCollected(item, overrideTTC = null) {
  const ttc = overrideTTC === null ? toNumber(item.price_ttc) : toNumber(overrideTTC)
  return ttc - priceHT(item, ttc)
}

export function paymentFeeHT(item, overrideTTC = null) {
  const ttc = overrideTTC === null ? toNumber(item.price_ttc) : toNumber(overrideTTC)
  return ttc * (toNumber(item.payment_fee_rate, 0) / 100)
}

export function fullCostHT(item, overrideTTC = null) {
  return (
    toNumber(item.purchase_price_ht) +
    toNumber(item.paint_cost_ht) +
    toNumber(item.firing_cost_ht) +
    toNumber(item.packaging_cost_ht) +
    toNumber(item.other_fixed_cost_ht) +
    paymentFeeHT(item, overrideTTC)
  )
}

export function marginHT(item, overrideTTC = null) {
  return priceHT(item, overrideTTC) - fullCostHT(item, overrideTTC)
}

export function marginRate(item, overrideTTC = null) {
  const ht = priceHT(item, overrideTTC)
  return ht ? (marginHT(item, overrideTTC) / ht) * 100 : 0
}

export function statusOf(item) {
  const qty = toNumber(item.stock_qty)
  const min = toNumber(item.min_qty)
  if (qty <= 0) return { label: 'Rupture', className: 'bad' }
  if (qty <= min) return { label: 'À commander', className: 'warn' }
  return { label: 'OK', className: 'ok' }
}

export function originLabel(origin) {
  return {
    FR: 'France',
    UE: 'UE fournisseur HT',
    HORS_UE: 'Hors UE'
  }[origin] || 'Autre'
}
