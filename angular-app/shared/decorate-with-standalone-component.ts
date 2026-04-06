import {
  createComponent,
  type EnvironmentProviders,
  type Provider,
  provideZoneChangeDetection,
  type Type,
} from '@angular/core';
import { createApplication } from '@angular/platform-browser';

import { EDS_BLOCK_HTML } from './block-tokens';

const teardownMap = new WeakMap<HTMLElement, () => void>();

export type StandaloneBlockMountOptions<C> = {
  component: Type<C>;
  hostClassName: string;
  /** When true (default), capture `block.innerHTML` before clearing and provide {@link EDS_BLOCK_HTML}. */
  passAuthoredHtml?: boolean;
  providers?: (blockConfig: unknown) => (Provider | EnvironmentProviders)[];
};

export async function decorateWithStandaloneComponent<C>(
  block: HTMLElement,
  blockConfig: unknown,
  options: StandaloneBlockMountOptions<C>,
): Promise<void> {
  const prev = teardownMap.get(block);
  if (prev) prev();

  const passHtml = options.passAuthoredHtml !== false;
  const authoredHtml = passHtml ? block.innerHTML : '';

  block.replaceChildren();

  block.classList.add(options.hostClassName);

  const providers: (Provider | EnvironmentProviders)[] = [
    provideZoneChangeDetection({ eventCoalescing: true }),
    ...(passHtml ? [{ provide: EDS_BLOCK_HTML, useValue: authoredHtml }] : []),
    ...(options.providers?.(blockConfig) ?? []),
  ];

  const appRef = await createApplication({ providers });

  const compRef = createComponent(options.component, {
    environmentInjector: appRef.injector,
    hostElement: block,
  });

  appRef.attachView(compRef.hostView);
  compRef.changeDetectorRef.detectChanges();

  const teardown = () => {
    compRef.destroy();
    appRef.destroy();
    teardownMap.delete(block);
  };
  teardownMap.set(block, teardown);
}
