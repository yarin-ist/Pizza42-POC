/**
 * Angular test-environment bootstrap.
 *
 * Angular 21 is zoneless — no zone.js polyfill required.
 * We still need the testing platform so TestBed can compile and create
 * standalone components and resolve the Angular DI tree.
 */
import '@angular/compiler'; // enables JIT template compilation in tests

import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  { teardown: { destroyAfterEach: true } },
);
