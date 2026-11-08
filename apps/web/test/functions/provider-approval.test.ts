// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../supabase/functions/_shared/http.ts';
import {
  isApprovedProvider, type ProviderApproval, requireApprovedProvider,
} from '../../supabase/functions/_shared/provider-approval.ts';

const approvedOccupation = { occupation_slug: 'eletricista', approved: true, registry_status: 'not_required' };

function provider(over: Partial<ProviderApproval> = {}): ProviderApproval {
  return { status: 'approved', occupations: [approvedOccupation], ...over };
}

describe('isApprovedProvider', () => {
  it('accepts an approved account with an approved occupation', () => {
    expect(isApprovedProvider(provider())).toBe(true);
    expect(isApprovedProvider(provider({ occupations: [{ ...approvedOccupation, registry_status: 'confirmed' }] }))).toBe(true);
  });

  it('refuses every status other than approved, even with an approved occupation', () => {
    for (const status of ['draft', 'pending_review', 'suspended']) {
      expect(isApprovedProvider(provider({ status })), status).toBe(false);
    }
  });

  it('refuses an account without an approved occupation', () => {
    expect(isApprovedProvider(provider({ occupations: [] }))).toBe(false);
    expect(isApprovedProvider(provider({ occupations: [{ ...approvedOccupation, approved: false }] }))).toBe(false);
  });

  it('refuses an approved occupation whose registry was rejected', () => {
    expect(isApprovedProvider(provider({ occupations: [{ ...approvedOccupation, registry_status: 'rejected' }] }))).toBe(false);
  });

  it('checks the given occupation when a slug is passed', () => {
    const occupations = [approvedOccupation, { occupation_slug: 'encanador', approved: false, registry_status: 'not_required' }];
    expect(isApprovedProvider(provider({ occupations }), 'eletricista')).toBe(true);
    expect(isApprovedProvider(provider({ occupations }), 'encanador')).toBe(false);
  });
});

describe('requireApprovedProvider', () => {
  it('answers 403 provider_not_approved for an unapproved account', () => {
    try {
      requireApprovedProvider(provider({ status: 'draft' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(403);
      expect((error as HttpError).code).toBe('provider_not_approved');
    }
  });

  it('does not throw for an approved account', () => {
    expect(() => requireApprovedProvider(provider())).not.toThrow();
  });
});
