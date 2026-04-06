import { Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { EDS_BLOCK_HTML } from '../../shared/block-tokens';

function isCardShellEmpty(card: HTMLElement): boolean {
  if (card.querySelector('picture')) return false;
  const t = card.textContent?.replace(/\s/g, '') ?? '';
  return t.length === 0;
}

function getDirectChildPs(el: HTMLElement): HTMLParagraphElement[] {
  return [...el.children].filter((c): c is HTMLParagraphElement => c.tagName === 'P');
}

/**
 * Column divs that match EDS profile shape: ≥5 direct &lt;p&gt;, first has &lt;picture&gt;.
 */
function findColumnDivs(scope: Element): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  scope.querySelectorAll('div').forEach((div) => {
    const ps = getDirectChildPs(div as HTMLElement);
    if (ps.length < 5) return;
    if (!ps[0]?.querySelector('picture')) return;
    candidates.push(div as HTMLElement);
  });
  return candidates.filter((d) => !candidates.some((other) => other !== d && d.contains(other)));
}

/**
 * One EDS column cell → card markup (divs only; picture / anchor preserved).
 */
function buildCard(column: HTMLElement, doc: Document): HTMLElement | null {
  if (isCardShellEmpty(column)) return null;

  const ps = getDirectChildPs(column);
  if (ps.length < 5) return null;

  const [pPic, pName, pTitle, pOrg, pDesc, pLink] = ps;

  const card = doc.createElement('div');
  card.className = 'profile-cards__card';

  const header = doc.createElement('div');
  header.className = 'profile-cards__header';

  const media = doc.createElement('div');
  media.className = 'profile-cards__media';
  const picture = pPic?.querySelector('picture');
  if (picture) {
    const picClone = picture.cloneNode(true) as HTMLElement;
    picClone.classList.add('profile-cards__picture');
    const img = picClone.querySelector('img');
    if (img) img.classList.add('profile-cards__image');
    media.appendChild(picClone);
  }

  const identity = doc.createElement('div');
  identity.className = 'profile-cards__identity';

  if (pName) {
    const nameEl = doc.createElement('div');
    nameEl.className = 'profile-cards__name';
    nameEl.textContent = pName.textContent?.trim() ?? '';
    identity.appendChild(nameEl);
  }
  if (pTitle) {
    const roleEl = doc.createElement('div');
    roleEl.className = 'profile-cards__role';
    roleEl.textContent = pTitle.textContent?.trim() ?? '';
    identity.appendChild(roleEl);
  }

  header.appendChild(media);
  header.appendChild(identity);

  const body = doc.createElement('div');
  body.className = 'profile-cards__body';

  if (pOrg) {
    const orgEl = doc.createElement('div');
    orgEl.className = 'profile-cards__org';
    orgEl.textContent = pOrg.textContent?.trim() ?? '';
    body.appendChild(orgEl);
  }
  if (pDesc) {
    const descEl = doc.createElement('div');
    descEl.className = 'profile-cards__description';
    descEl.textContent = pDesc.textContent?.trim() ?? '';
    body.appendChild(descEl);
  }

  const footer = doc.createElement('div');
  footer.className = 'profile-cards__footer';
  const cta = doc.createElement('div');
  cta.className = 'profile-cards__cta';
  if (pLink) {
    cta.innerHTML = pLink.innerHTML;
  }
  footer.appendChild(cta);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);

  return card;
}

/**
 * Rewrites EDS row/column markup: `.profile-cards` > `.profile-cards__row` > `.profile-cards__card` × n
 * (no `__rows` / `__column` wrappers). Fallback: one row with all detected cards.
 */
function decorateProfileCardsMarkup(html: string): string {
  const doc = new DOMParser().parseFromString(html.trim(), 'text/html');
  const rootEl = doc.body.querySelector('.profile-cards') ?? doc.body;

  const out = doc.createElement('div');
  out.className = 'profile-cards';

  const rowDivs = [...rootEl.children].filter((c): c is HTMLElement => c.tagName === 'DIV');

  let placedFromRows = false;

  rowDivs.forEach((rowEl) => {
    const rowOut = doc.createElement('div');
    rowOut.className = 'profile-cards__row';

    [...rowEl.children]
      .filter((c): c is HTMLElement => c.tagName === 'DIV')
      .forEach((colEl) => {
        const card = buildCard(colEl, doc);
        if (card) rowOut.appendChild(card);
      });

    if (rowOut.children.length > 0) {
      out.appendChild(rowOut);
      placedFromRows = true;
    }
  });

  if (!placedFromRows) {
    const flatRow = doc.createElement('div');
    flatRow.className = 'profile-cards__row';

    findColumnDivs(rootEl).forEach((colEl) => {
      const card = buildCard(colEl, doc);
      if (card) flatRow.appendChild(card);
    });

    if (flatRow.children.length > 0) {
      out.appendChild(flatRow);
    }
  }

  return out.outerHTML;
}

@Component({
  selector: 'profile-cards-root',
  standalone: true,
  templateUrl: './profile-cards.component.html',
  styleUrl: './profile-cards.component.scss'
})
export class ProfileCardsComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authoredHtml = inject(EDS_BLOCK_HTML, { optional: true });

  readonly safeDecoratedHtml = computed(() => {
    const raw = this.authoredHtml?.trim();
    if (!raw) return null;
    return this.sanitizer.bypassSecurityTrustHtml(decorateProfileCardsMarkup(raw));
  });
}
