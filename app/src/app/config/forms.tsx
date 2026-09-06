/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { ErrorText } from '@/lib/error-text';
import {
  addExchangeRate,
  updateIntercoFee,
  updateTransportTier,
  updateCustomsRate,
  updateMarginGrid,
  updateSetting,
  type ConfigActionState,
} from './actions';

// Every editable row below uses the same technique: an empty <form> (just
// the id, action and hidden primary-key inputs) sits in the first <td>,
// and the visible <input>/<button> elsewhere in the row reference it via
// the HTML5 `form="<id>"` attribute instead of nesting inside it. A
// <form> can't validly wrap multiple <td>/<tr> siblings, and merging
// fields into one cell via colSpan would misalign the row against the
// <thead> in page.tsx, which always declares one <th> per field
// regardless of write access. This keeps the cell count — and so the
// column alignment — identical to the read-only case, just with an
// <input> instead of static text in each one.

export function ExchangeRateForm({ currencies }: { currencies: { code: string }[] }) {
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(addExchangeRate, undefined);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 p-3">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Currency</label>
        <select name="currency" required className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Rate (per EUR)</label>
        <input
          name="rate_per_eur"
          type="number"
          step="0.000001"
          required
          className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Effective date</label>
        <input
          name="effective_date"
          type="date"
          defaultValue={today}
          required
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Source</label>
        <input
          name="source"
          required
          placeholder="SAP, manual, ..."
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Reason</label>
        <input
          name="reason"
          required
          placeholder="Why this change?"
          className="w-48 rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Propose rate'}
      </button>
      <ErrorText state={state} />
      {state && 'success' in state && <p className="text-xs text-green-700">Submitted — pending approval.</p>}
    </form>
  );
}

export function IntercoFeeRow({
  fee,
  canWrite,
}: {
  fee: { supplier_branch: string; seller_branch: string; fee: number };
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(updateIntercoFee, undefined);
  const formId = `fee-${fee.supplier_branch}-${fee.seller_branch}`;

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4">
        {fee.supplier_branch}
        {canWrite && (
          <form id={formId} action={formAction}>
            <input type="hidden" name="supplier_branch" value={fee.supplier_branch} />
            <input type="hidden" name="seller_branch" value={fee.seller_branch} />
          </form>
        )}
      </td>
      <td className="py-2 pr-4">{fee.seller_branch}</td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="fee"
            type="number"
            step="0.0001"
            defaultValue={fee.fee}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          fee.fee
        )}
        <ErrorText state={state} />
      </td>
      {canWrite && (
        <td className="py-2 pr-4">
          <input
            form={formId}
            name="reason"
            required
            placeholder="Why this change?"
            className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </td>
      )}
      {canWrite && (
        <td className="py-2 pr-4">
          <button
            form={formId}
            type="submit"
            disabled={pending}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            {pending ? '…' : 'Propose'}
          </button>
          {state && 'success' in state && <p className="mt-1 text-xs text-green-700">Submitted.</p>}
        </td>
      )}
    </tr>
  );
}

export function TransportTierRow({
  tier,
  canWrite,
}: {
  tier: { branch_id: string; tier: number; max_weight_kg: number | null; cost: number; currency: string };
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(updateTransportTier, undefined);
  const formId = `tt-${tier.branch_id}-${tier.tier}`;

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4">
        {tier.branch_id}
        {canWrite && (
          <form id={formId} action={formAction}>
            <input type="hidden" name="branch_id" value={tier.branch_id} />
            <input type="hidden" name="tier" value={tier.tier} />
          </form>
        )}
      </td>
      <td className="py-2 pr-4">{tier.tier}</td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="max_weight_kg"
            type="number"
            step="0.01"
            defaultValue={tier.max_weight_kg ?? ''}
            placeholder="open-ended"
            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          (tier.max_weight_kg ?? '—')
        )}
      </td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="cost"
            type="number"
            step="0.01"
            defaultValue={tier.cost}
            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          tier.cost
        )}
      </td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="currency"
            defaultValue={tier.currency}
            maxLength={3}
            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          tier.currency
        )}
        <ErrorText state={state} />
      </td>
      {canWrite && (
        <td className="py-2 pr-4">
          <input
            form={formId}
            name="reason"
            required
            placeholder="Why this change?"
            className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </td>
      )}
      {canWrite && (
        <td className="py-2 pr-4">
          <button
            form={formId}
            type="submit"
            disabled={pending}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            {pending ? '…' : 'Propose'}
          </button>
          {state && 'success' in state && <p className="mt-1 text-xs text-green-700">Submitted.</p>}
        </td>
      )}
    </tr>
  );
}

export function CustomsRateRow({
  rate,
  description,
  canWrite,
}: {
  rate: { hs_code: string; zone: string; rate: number };
  description: string;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(updateCustomsRate, undefined);
  const formId = `cr-${rate.hs_code}-${rate.zone}`;

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4" title={description}>
        {rate.hs_code}
        {canWrite && (
          <form id={formId} action={formAction}>
            <input type="hidden" name="hs_code" value={rate.hs_code} />
            <input type="hidden" name="zone" value={rate.zone} />
          </form>
        )}
      </td>
      <td className="py-2 pr-4">{rate.zone}</td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="rate"
            type="number"
            step="0.0001"
            defaultValue={rate.rate}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          rate.rate
        )}
        <ErrorText state={state} />
      </td>
      {canWrite && (
        <td className="py-2 pr-4">
          <input
            form={formId}
            name="reason"
            required
            placeholder="Why this change?"
            className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </td>
      )}
      {canWrite && (
        <td className="py-2 pr-4">
          <button
            form={formId}
            type="submit"
            disabled={pending}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            {pending ? '…' : 'Propose'}
          </button>
          {state && 'success' in state && <p className="mt-1 text-xs text-green-700">Submitted.</p>}
        </td>
      )}
    </tr>
  );
}

export function MarginGridRow({
  grid,
  canWrite,
}: {
  grid: { branch_id: string; tier: number; max_cost_eur: number | null; margin: number };
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(updateMarginGrid, undefined);
  const formId = `mg-${grid.branch_id}-${grid.tier}`;

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4">
        {grid.branch_id}
        {canWrite && (
          <form id={formId} action={formAction}>
            <input type="hidden" name="branch_id" value={grid.branch_id} />
            <input type="hidden" name="tier" value={grid.tier} />
          </form>
        )}
      </td>
      <td className="py-2 pr-4">{grid.tier}</td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="max_cost_eur"
            type="number"
            step="0.01"
            defaultValue={grid.max_cost_eur ?? ''}
            placeholder="open-ended"
            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          (grid.max_cost_eur ?? '—')
        )}
      </td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="margin"
            type="number"
            step="0.0001"
            defaultValue={grid.margin}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          grid.margin
        )}
        <ErrorText state={state} />
      </td>
      {canWrite && (
        <td className="py-2 pr-4">
          <input
            form={formId}
            name="reason"
            required
            placeholder="Why this change?"
            className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </td>
      )}
      {canWrite && (
        <td className="py-2 pr-4">
          <button
            form={formId}
            type="submit"
            disabled={pending}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            {pending ? '…' : 'Propose'}
          </button>
          {state && 'success' in state && <p className="mt-1 text-xs text-green-700">Submitted.</p>}
        </td>
      )}
    </tr>
  );
}

export function SettingRow({
  setting,
  canWrite,
}: {
  setting: { key: string; value: unknown; note: string | null };
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(updateSetting, undefined);
  const formId = `set-${setting.key}`;
  const rawValue = JSON.stringify(setting.value);

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4">
        {setting.key}
        {canWrite && (
          <form id={formId} action={formAction}>
            <input type="hidden" name="key" value={setting.key} />
          </form>
        )}
      </td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="value"
            defaultValue={rawValue}
            title='Raw JSON value, e.g. 0.15 or "SAP"'
            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          rawValue
        )}
      </td>
      <td className="py-2 pr-4">
        {canWrite ? (
          <input
            form={formId}
            name="note"
            defaultValue={setting.note ?? ''}
            className="w-48 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          (setting.note ?? '—')
        )}
        <ErrorText state={state} />
      </td>
      {canWrite && (
        <td className="py-2 pr-4">
          <button
            form={formId}
            type="submit"
            disabled={pending}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            {pending ? '…' : 'Save'}
          </button>
        </td>
      )}
    </tr>
  );
}
