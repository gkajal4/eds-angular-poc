import { Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { EDS_BLOCK_HTML } from '../../shared/block-tokens';

/**
 * Adds block-scoped classes to EDS-authored markup (picture + name/title + bio columns).
 */
function decorateProfileCardMarkup(html: string): string {
  const doc = new DOMParser().parseFromString(html.trim(), 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) {
    return '<div class="profile-card__container"></div>';
  }

  root.classList.add('profile-card__container');

  const columnDivs = [...root.children].filter(
    (el): el is HTMLElement => el.tagName === 'DIV',
  );

  const [mediaCol, metaCol, bioCol] = columnDivs;

  if (mediaCol) {
    mediaCol.classList.add('profile-card__media');
    const picture = mediaCol.querySelector('picture');
    if (picture) {
      picture.classList.add('profile-card__picture');
      const img = picture.querySelector('img');
      if (img) img.classList.add('profile-card__image');
    }
  }

  if (metaCol) {
    metaCol.classList.add('profile-card__meta');
    const ps = [...metaCol.querySelectorAll(':scope > p')];
    if (ps[0]) ps[0].classList.add('profile-card__name');
    if (ps[1]) ps[1].classList.add('profile-card__title');
  }

  if (bioCol) {
    bioCol.classList.add('profile-card__bio');
    const p = bioCol.querySelector('p');
    if (p) p.classList.add('profile-card__text');
  }

  return root.outerHTML;
}

@Component({
  selector: 'profile-card-root',
  standalone: true,
  templateUrl: './profile-card.component.html',
  styleUrl: './profile-card.component.scss'
})
export class ProfileCardComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authoredHtml = inject(EDS_BLOCK_HTML, { optional: true });

  /** Authored block HTML with container / BEM classes applied for styling. */
  readonly safeDecoratedHtml = computed(() => {
    const raw = this.authoredHtml?.trim();
    if (!raw) return null;
    return this.sanitizer.bypassSecurityTrustHtml(decorateProfileCardMarkup(raw));
  });
}
