/**
 * TMSI Equipment Price Listing
 * Copyright (c) 2026 Pedro Alexandre. All rights reserved.
 * PROPRIETARY AND CONFIDENTIAL — unauthorised use, copying, modification or
 * distribution is strictly prohibited. See LICENSE at the repository root.
 */

import Link from 'next/link';
import { getBranding } from '@/lib/branding';

// item 42: informative only, no consent flow — see the header note below and
// docs/DATA-PROCESSING-NOTICE.md (source of truth, Portuguese) for why. Any
// authenticated user can reach this (middleware.ts doesn't exempt it, so the
// default "session required" rule applies — no per-role gate here, by design).
export default async function PrivacyPage() {
  const branding = await getBranding();

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Data processing notice</h1>
        <p className="mb-6 text-sm text-gray-500">{branding.displayName}</p>

        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This is internal information, not legal advice. It describes what this system
          actually does, measured directly against its database, containers and host — not a
          generic template.
        </p>

        <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Who is responsible
        </h2>
        <p className="mb-4 text-sm text-gray-700">
          For this pilot phase: Pedro Alexandre, personally — the app runs on a personal
          server under a personal domain while a licence with your organisation is under
          negotiation. Contact: pedroalexandre625@gmail.com. This is the answer for the
          current phase, not necessarily the final one.
        </p>

        <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          What personal data this system holds
        </h2>
        <ul className="mb-4 list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>
            <strong>Name and email</strong> — to identify who is signed in and what their role
            is authorised to see. Kept indefinitely; no deletion mechanism exists yet.
          </li>
          <li>
            <strong>Password</strong> — stored only as a hash, never in plain text. Nobody can
            read it directly, including an administrator.
          </li>
          <li>
            <strong>Role and branch/channel assignment</strong> — determines what you can see
            and do. Visible to you and to admins.
          </li>
          <li>
            <strong>Session data (IP address, browser)</strong> — standard for any authenticated
            web app; kept only while a session is valid, not shown in any screen.
          </li>
          <li>
            <strong>Audit trail</strong> — who changed a price, a configuration value, or a
            profile, and when. This is the core accountability mechanism of the app. Declared
            retention: <strong>5 years</strong> from each entry — not yet implemented (the
            table has no automatic deletion today, see below).
          </li>
          <li>
            <strong>Server and container logs</strong> — access logs (14 days), container logs
            (kept by size, not by a fixed number of days). Not reachable from inside the app.
          </li>
          <li>
            <strong>Nightly database backups</strong> — a full copy, kept 30 days and then
            automatically deleted.
          </li>
        </ul>

        <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          What it&apos;s used for
        </h2>
        <p className="mb-4 text-sm text-gray-700">
          Identifying who is using the app and enforcing what their role may see; proving who
          made a change and when; keeping the service running and recoverable. Nothing here is
          used for profiling, marketing, or shared with anyone outside what this notice
          describes.
        </p>

        <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          What you can ask for, and what already works
        </h2>
        <p className="mb-2 text-sm text-gray-700">
          Contact the person named above to see what data is held about you, correct a wrong
          name or email, or stop having an account.
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>Correcting your name or email — an admin can do this today, on request.</li>
          <li>
            Disabling your access — reversible, done by an admin; this does not erase the audit
            history of your past actions, since that record exists to protect everyone, not
            just you.
          </li>
        </ul>

        <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          What this system doesn&apos;t do yet — stated plainly
        </h2>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>There is no way to fully delete or anonymise an account yet.</li>
          <li>There is no self-service &quot;export my data&quot; button yet.</li>
          <li>
            The audit trail&apos;s 5-year retention above is a decision, not yet a running
            mechanism — today the table keeps every entry without a time limit.
          </li>
        </ul>

        <Link href="/" className="mt-6 inline-block text-sm font-medium text-gray-700 underline">
          Back
        </Link>
      </div>
    </div>
  );
}
