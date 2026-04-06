import 'zone.js';
/* Side effect: extracted to blocks/profile-card/profile-card.css (aem loadCSS). */
import './profile-card.component.scss';
import { decorateWithStandaloneComponent } from '../../shared/decorate-with-standalone-component';
import { ProfileCardComponent } from './profile-card.component';

/**
 * Standard EDS block contract: default export decorate(block).
 * aem.js loadBlock imports this module and calls await mod.default(block).
 */
export default async function decorate(block: HTMLElement) {
  await decorateWithStandaloneComponent(block, undefined, {
    component: ProfileCardComponent,
    hostClassName: 'profile-card-host',
  });
}
