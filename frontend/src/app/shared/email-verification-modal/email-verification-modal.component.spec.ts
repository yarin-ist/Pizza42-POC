/**
 * Unit tests for EmailVerificationModalComponent
 *
 * Strategy: TestBed.runInInjectionContext with NO imports in configureTestingModule.
 * This bypasses Angular's JIT templateUrl resolution (which fails in jsdom) while
 * fully testing all class-level behaviour:
 *   - @Input() email is bound and readable
 *   - @Output() dismissed emits on dismiss()
 *   - No spurious emissions on creation
 *
 * Template rendering is covered by e2e / integration tests (out of scope for
 * this unit-test phase). The critical contract is the TypeScript class API.
 */
import { TestBed } from '@angular/core/testing';
import { EventEmitter } from '@angular/core';

import { EmailVerificationModalComponent } from './email-verification-modal.component';

describe('EmailVerificationModalComponent', () => {
  let component: EmailVerificationModalComponent;

  beforeEach(() => {
    // No component in imports — avoid JIT templateUrl resolution in jsdom
    TestBed.configureTestingModule({ providers: [] });
    component = TestBed.runInInjectionContext(() => new EmailVerificationModalComponent());
  });

  // ── @Output() dismissed ────────────────────────────────────────────────────

  it('dismissed is an EventEmitter (correct @Output type)', () => {
    expect(component.dismissed).toBeInstanceOf(EventEmitter);
  });

  it('dismiss() emits the dismissed event exactly once', () => {
    const spy = vi.fn();
    component.dismissed.subscribe(spy);

    component.dismiss();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('dismiss() emits each time it is called — no debounce or side-effects', () => {
    const spy = vi.fn();
    component.dismissed.subscribe(spy);

    component.dismiss();
    component.dismiss();
    component.dismiss();

    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('does NOT emit dismissed automatically on creation', () => {
    const spy = vi.fn();
    component.dismissed.subscribe(spy);
    // No explicit dismiss() call
    expect(spy).not.toHaveBeenCalled();
  });

  // ── @Input() email ─────────────────────────────────────────────────────────

  it('email @Input defaults to empty string', () => {
    expect(component.email).toBe('');
  });

  it('email @Input stores and exposes any value', () => {
    component.email = 'verify@pizza42.com';
    expect(component.email).toBe('verify@pizza42.com');
  });

  it('email @Input can be updated after initial set', () => {
    component.email = 'first@pizza42.com';
    component.email = 'second@pizza42.com';
    expect(component.email).toBe('second@pizza42.com');
  });

  // ── Guard: dismiss() emits even when email is empty ────────────────────────

  it('dismiss() still emits when email is empty string', () => {
    const spy = vi.fn();
    component.email = '';
    component.dismissed.subscribe(spy);

    component.dismiss();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
