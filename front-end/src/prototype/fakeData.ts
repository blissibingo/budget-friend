// PROTOTYPE — throwaway fake September data for the v1.1 overview prototype

import type { Category, Transaction } from '../api'

// provisional hues; #33 picks and validates the real palette
export const PALETTE = [
  '#60a5fa', '#f59e0b', '#34d399', '#f472b6',
  '#a78bfa', '#22d3ee', '#fb7185', '#a3e635',
]

export const UNCATEGORIZED_GREY = '#71717a'

function category(id: number, name: string, color: string | null, excluded = false): Category {
  return { id, name, user_id: null, color, excluded_from_spend: excluded }
}

export const CATEGORIES: Category[] = [
  category(1, 'Groceries', PALETTE[2]),
  category(2, 'Dining', PALETTE[1]),
  category(3, 'Transport', PALETTE[0]),
  category(4, 'Bills', PALETTE[4]),
  category(5, 'Shopping', PALETTE[3]),
  category(6, 'Entertainment', PALETTE[5]),
  category(7, 'Health', PALETTE[6]),
  category(8, 'Subscriptions', PALETTE[7]),
  category(9, 'Income', null),
  category(10, 'Transfer', null, true),
  category(11, 'Savings', null, true),
]

let nextId = 1

function row(
  date: string,
  amount: number,
  merchant: string,
  description: string,
  categoryId: number | null,
): Transaction {
  return {
    id: nextId++,
    amount: amount.toFixed(2),
    date: `2026-09-${date}`,
    merchant,
    description,
    source: 'rbc_debit',
    occurrence: 1,
    created_at: '2026-10-01T00:00:00.000Z',
    user_id: 1,
    category_id: categoryId,
  }
}

const BANK = 'Bank transaction'

export const TRANSACTIONS: Transaction[] = [
  row('30', -64.18, 'Loblaws', 'Interac purchase - 4417 - Loblaws', 1),
  row('30', -18.5, 'Pai Northern Thai', 'Visa purchase - Pai Northern Thai', 2),
  row('29', -3.35, 'TTC', 'Visa purchase - TTC', 3),
  row('29', -40, BANK, 'ATM withdrawal', null),
  row('28', -129.99, 'Uniqlo', 'Visa purchase - Uniqlo', 5),
  row('28', 30, 'Uniqlo', 'Visa refund - Uniqlo', 5),
  row('27', -22.6, 'Cineplex', 'Visa purchase - Cineplex', 6),
  row('26', -88.42, 'No Frills', 'Interac purchase - 4417 - No Frills', 1),
  row('25', -1180.4, BANK, 'Payment - RBC Visa', 10),
  row('25', 2150, 'Payroll', 'Payroll deposit - Acme Corp', 9),
  row('25', -400, BANK, 'Transfer to savings', 11),
  row('24', -16.99, 'Netflix', 'Visa purchase - Netflix', 8),
  row('23', -45.0, 'Shoppers Drug Mart', 'Visa purchase - Shoppers Drug Mart', 7),
  row('22', -54.3, 'Uber', 'Visa purchase - Uber', 3),
  row('21', -71.25, 'Sushi Masaki', 'Visa purchase - Sushi Masaki', 2),
  row('20', -112.0, 'Toronto Hydro', 'Pre-authorized debit - Toronto Hydro', 4),
  row('19', -12.4, 'Tim Hortons', 'Visa purchase - Tim Hortons', null),
  row('18', -76.9, 'Loblaws', 'Interac purchase - 4417 - Loblaws', 1),
  row('17', -60, BANK, 'Cheque #31', null),
  row('15', -1650, 'Landlord', 'E-transfer sent - Landlord', 4),
  row('14', -38.75, 'The Keg', 'Visa purchase - The Keg', 2),
  row('12', -11.99, 'Spotify', 'Visa purchase - Spotify', 8),
  row('11', -94.13, 'Costco', 'Visa purchase - Costco', 1),
  row('10', 2150, 'Payroll', 'Payroll deposit - Acme Corp', 9),
  row('09', -24.0, 'Presto', 'Visa purchase - Presto', 3),
  row('08', -210.5, 'Best Buy', 'Visa purchase - Best Buy', 5),
  row('05', -85.0, 'Rogers', 'Pre-authorized debit - Rogers', 4),
  row('03', -33.8, 'Freshii', 'Visa purchase - Freshii', 2),
  row('02', -58.64, 'Metro', 'Interac purchase - 4417 - Metro', 1),
  row('01', -9.5, 'Unknown Vendor 4471', 'Visa purchase - Unknown Vendor 4471', null),
]
