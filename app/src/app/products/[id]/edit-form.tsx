/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { updateProduct, type UpdateProductState } from './actions';

const ITEM_TYPES = ['equipment', 'spare_part', 'option', 'service'];
const STATUSES = ['draft', 'pending', 'active', 'review', 'inactive', 'discontinued'];

// exw_price/supplier_id/SAP codes are optional here because the page only
// selects them for callers with can_read_costs() — this form only ever
// renders for canManageProducts() (admin/product_manager), which is
// always a subset of that, so they're really always present when it
// matters. The `?? ...` fallbacks below exist to satisfy the type, not
// because a manager should ever actually see them missing.
type Product = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  item_type: string;
  parent_id: string | null;
  supplier_id?: string | null;
  origin_country: string | null;
  currency: string;
  exw_price?: number;
  primary_branch: string;
  hs_code: string | null;
  gross_weight_kg: number | null;
  net_weight_kg: number | null;
  volume_m3: number | null;
  dimensions: string | null;
  palletizable: boolean | null;
  pallets: number | null;
  stackable: boolean | null;
  unit: string | null;
  lead_time_days: number | null;
  sap_code_sa?: string | null;
  sap_code_cn?: string | null;
  sap_code_us?: string | null;
  sap_code_uk?: string | null;
  status: string;
  sold_in: string[];
};

// Status is a plain <select> over all six values, unrestricted client-side
// — the schema itself enforces no transition graph beyond the activation
// trigger (0001 §3, active/review only) and the EXW-on-active-reopens-
// review trigger (§5). Anything else this form lets through and the real
// trigger rejects is exactly the point: the DB's own message is shown
// below, never a client-side guess at what it would say.
export function EditProductForm({
  product,
  branches,
  categories,
  units,
  suppliers,
  hsCodes,
}: {
  product: Product;
  branches: { id: string; name: string }[];
  categories: { id?: string; name?: string }[];
  units: { code?: string; name?: string }[];
  suppliers: { id?: string; name?: string }[];
  hsCodes: { code?: string; description?: string }[];
}) {
  const [state, formAction, pending] = useActionState<UpdateProductState, FormData>(updateProduct, undefined);

  return (
    <form action={formAction} className="space-y-6 rounded-lg border border-gray-200 p-4">
      <input type="hidden" name="id" value={product.id} />

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-medium uppercase text-gray-500">Identity</legend>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            defaultValue={product.name}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={product.description ?? ''}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="item_type" className="mb-1 block text-sm font-medium">
              Item type
            </label>
            <select
              id="item_type"
              name="item_type"
              defaultValue={product.item_type}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="category_id" className="mb-1 block text-sm font-medium">
              Category
            </label>
            <select
              id="category_id"
              name="category_id"
              defaultValue={product.category_id ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="parent_id" className="mb-1 block text-sm font-medium">
            Parent product (required for options)
          </label>
          <input
            id="parent_id"
            name="parent_id"
            defaultValue={product.parent_id ?? ''}
            placeholder="T-0000"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="supplier_id" className="mb-1 block text-sm font-medium">
              Supplier
            </label>
            <select
              id="supplier_id"
              name="supplier_id"
              defaultValue={product.supplier_id ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="origin_country" className="mb-1 block text-sm font-medium">
              Origin country (ISO2)
            </label>
            <input
              id="origin_country"
              name="origin_country"
              defaultValue={product.origin_country ?? ''}
              maxLength={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-medium uppercase text-gray-500">Commercial</legend>
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="exw_price" className="mb-1 block text-sm font-medium">
              EXW price
            </label>
            <input
              id="exw_price"
              name="exw_price"
              type="number"
              step="0.01"
              defaultValue={product.exw_price}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="currency" className="mb-1 block text-sm font-medium">
              Currency
            </label>
            <input
              id="currency"
              name="currency"
              defaultValue={product.currency}
              maxLength={3}
              required
              className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="primary_branch" className="mb-1 block text-sm font-medium">
            Primary branch (supplying)
          </label>
          <select
            id="primary_branch"
            name="primary_branch"
            defaultValue={product.primary_branch}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium">Sold in</span>
          <div className="flex flex-wrap gap-3">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="sold_in" value={b.id} defaultChecked={product.sold_in.includes(b.id)} />
                {b.id}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-medium uppercase text-gray-500">
          Customs &amp; logistics (required for active/review — except HS/weight for options and services)
        </legend>
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="hs_code" className="mb-1 block text-sm font-medium">
              HS code
            </label>
            <select
              id="hs_code"
              name="hs_code"
              defaultValue={product.hs_code ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {hsCodes.map((h) => (
                <option key={h.code} value={h.code}>
                  {h.code} — {h.description}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="unit" className="mb-1 block text-sm font-medium">
              Unit
            </label>
            <select
              id="unit"
              name="unit"
              defaultValue={product.unit ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="gross_weight_kg" className="mb-1 block text-sm font-medium">
              Gross weight (kg)
            </label>
            <input
              id="gross_weight_kg"
              name="gross_weight_kg"
              type="number"
              step="0.01"
              defaultValue={product.gross_weight_kg ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="net_weight_kg" className="mb-1 block text-sm font-medium">
              Net weight (kg)
            </label>
            <input
              id="net_weight_kg"
              name="net_weight_kg"
              type="number"
              step="0.01"
              defaultValue={product.net_weight_kg ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="lead_time_days" className="mb-1 block text-sm font-medium">
              Lead time (days)
            </label>
            <input
              id="lead_time_days"
              name="lead_time_days"
              type="number"
              defaultValue={product.lead_time_days ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="palletizable" defaultChecked={product.palletizable ?? false} />
            Palletizable
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="stackable" defaultChecked={product.stackable ?? false} />
            Stackable
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-medium uppercase text-gray-500">
          SAP code — only the one matching the primary branch above is required for activation
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="sap_code_sa" className="mb-1 block text-sm font-medium">
              SAP (SA)
            </label>
            <input
              id="sap_code_sa"
              name="sap_code_sa"
              defaultValue={product.sap_code_sa ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="sap_code_cn" className="mb-1 block text-sm font-medium">
              SAP (TBM/CN)
            </label>
            <input
              id="sap_code_cn"
              name="sap_code_cn"
              defaultValue={product.sap_code_cn ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="sap_code_us" className="mb-1 block text-sm font-medium">
              SAP (CORP/US)
            </label>
            <input
              id="sap_code_us"
              name="sap_code_us"
              defaultValue={product.sap_code_us ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="sap_code_uk" className="mb-1 block text-sm font-medium">
              SAP (LTD/UK)
            </label>
            <input
              id="sap_code_uk"
              name="sap_code_uk"
              defaultValue={product.sap_code_uk ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xs font-medium uppercase text-gray-500">Lifecycle</legend>
        <select
          id="status"
          name="status"
          defaultValue={product.status}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </fieldset>

      {state && 'error' in state && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state && 'success' in state && <p className="text-sm text-green-700">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
