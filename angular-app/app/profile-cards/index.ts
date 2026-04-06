import 'zone.js';
/* Side effect: extracted to blocks/profile-cards/profile-cards.css (aem loadCSS). */
import './profile-cards.component.scss';
import { decorateWithStandaloneComponent } from '../../shared/decorate-with-standalone-component';
import { ProfileCardsComponent } from './profile-cards.component';

/**
 * Standard EDS block contract: default export decorate(block).
 * aem.js loadBlock imports this module and calls await mod.default(block).
 */
export default async function decorate(block: HTMLElement) {
  await decorateWithStandaloneComponent(block, undefined, {
    component: ProfileCardsComponent,
    hostClassName: 'profile-cards-host',
  });
}
