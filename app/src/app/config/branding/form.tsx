/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

'use client';

import { useActionState } from 'react';
import { ErrorText } from '@/lib/error-text';
import type { Branding } from '@/lib/branding';
import { saveBranding, type BrandingActionState } from './actions';

export function BrandingForm({ branding, hasLogo }: { branding: Branding; hasLogo: boolean }) {
  const [state, formAction, pending] = useActionState<BrandingActionState, FormData>(saveBranding, undefined);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div>
        <label htmlFor="display_name" className="mb-1 block text-sm font-medium">
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          required
          defaultValue={branding.displayName}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">Shown in the browser tab, the home page and every document.</p>
      </div>

      <div>
        <label htmlFor="tagline" className="mb-1 block text-sm font-medium">
          Tagline (optional)
        </label>
        <input
          id="tagline"
          name="tagline"
          defaultValue={branding.tagline}
          placeholder="e.g. Quality equipment, worldwide"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="logo" className="mb-1 block text-sm font-medium">
          Logo (PNG or JPEG, up to 2 MB)
        </label>
        {hasLogo && (
          <img src="/api/branding/logo" alt="Current logo" className="mb-2 h-12 w-auto border border-gray-200 p-1" />
        )}
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">Leave empty to keep the current logo.</p>
      </div>

      <div className="flex gap-4">
        <div>
          <label htmlFor="primary_color" className="mb-1 block text-sm font-medium">
            Primary colour
          </label>
          <input
            id="primary_color"
            name="primary_color"
            type="color"
            defaultValue={branding.primaryColor}
            className="h-10 w-16 rounded-md border border-gray-300"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="font_family" className="mb-1 block text-sm font-medium">
            Font family
          </label>
          <input
            id="font_family"
            name="font_family"
            required
            defaultValue={branding.fontFamily}
            placeholder="Arial"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">A font name available in Excel and in the browser used to print.</p>
        </div>
      </div>

      <div>
        <label htmlFor="footer_text" className="mb-1 block text-sm font-medium">
          Document footer (optional)
        </label>
        <input
          id="footer_text"
          name="footer_text"
          defaultValue={branding.footerText}
          placeholder="e.g. Acme Corp — internal use only"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Shown at the bottom of the Excel export and the print view — never the software&apos;s own
          licence notice, which stays in the app only (login page footer).
        </p>
      </div>

      <div>
        <label htmlFor="legal_text" className="mb-1 block text-sm font-medium">
          Legal text (optional)
        </label>
        <textarea
          id="legal_text"
          name="legal_text"
          rows={3}
          defaultValue={branding.legalText}
          placeholder="e.g. Prices exclude VAT. Valid for 30 days."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save branding'}
      </button>
      <ErrorText state={state} />
      {state && 'success' in state && <p className="text-xs text-green-700">Saved.</p>}
    </form>
  );
}
