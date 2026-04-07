import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { EDS_BLOCK_HTML } from '../../shared/block-tokens';

/** Shape of `/profile-cards-data.json` from AEM sheet JSON (`:type` sheet). */
export type ProfileCardsSheetPayload = {
  total?: number;
  limit?: number;
  offset?: number;
  data?: ProfileCardsSheetRow[];
  ':type'?: string;
};

export type ProfileCardsSheetRow = Record<string, string>;

/**
 * `datasheet` is on the EDS `.block` host or parent (not always present in `EDS_BLOCK_HTML`).
 */
function isDatasheetBlockContext(host: HTMLElement): boolean {
  if (host.classList.contains('datasheet')) return true;
  if (host.parentElement?.classList.contains('datasheet')) return true;
  const block = host.closest('.block');
  return block instanceof HTMLElement && block.classList.contains('datasheet');
}

/** EDS may send `<div class="profile-cards datasheet">…</div>` — separate handling from default cards. */
function isProfileCardsDatasheetVariation(html: string): boolean {
  const doc = new DOMParser().parseFromString(html.trim(), 'text/html');
  if (doc.body.querySelector('.profile-cards.datasheet')) return true;
  const root = doc.body.querySelector('.profile-cards') ?? doc.body.firstElementChild;
  return (
    root instanceof HTMLElement
    && root.classList.contains('profile-cards')
    && root.classList.contains('datasheet')
  );
}

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

/** Sheet column keys from AEM (includes typo `devision`). */
const SHEET_KEY_IMAGE = 'profile image';
const SHEET_KEY_NAME = 'name';
const SHEET_KEY_DESIGNATION = 'designation';
const SHEET_KEY_DIVISION = 'devision';
const SHEET_KEY_DIVISION_ALT = 'division';
const SHEET_KEY_DESCRIPTION = 'description';
const SHEET_KEY_CTA_LABEL = 'learn more label';
const SHEET_KEY_CTA_LINK = 'learn more link';

function chunkPairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    out.push(items.slice(i, i + 2));
  }
  return out;
}

/**
 * One sheet row → same DOM as {@link buildCard} (media, identity, body, CTA).
 */
function buildCardFromSheetRow(row: ProfileCardsSheetRow, doc: Document): HTMLElement {
  const imgSrc = (row[SHEET_KEY_IMAGE] ?? '').trim();
  const name = (row[SHEET_KEY_NAME] ?? '').trim();
  const designation = (row[SHEET_KEY_DESIGNATION] ?? '').trim();
  const division = (row[SHEET_KEY_DIVISION] ?? row[SHEET_KEY_DIVISION_ALT] ?? '').trim();
  const description = (row[SHEET_KEY_DESCRIPTION] ?? '').trim();
  const ctaLabel = (row[SHEET_KEY_CTA_LABEL] ?? 'Learn more').trim();
  const ctaHref = (row[SHEET_KEY_CTA_LINK] ?? '#').trim();

  const card = doc.createElement('div');
  card.className = 'profile-cards__card';

  const header = doc.createElement('div');
  header.className = 'profile-cards__header';

  const media = doc.createElement('div');
  media.className = 'profile-cards__media';
  const picture = doc.createElement('picture');
  picture.className = 'profile-cards__picture';
  const img = doc.createElement('img');
  img.className = 'profile-cards__image';
  img.src = imgSrc;
  img.alt = '';
  img.loading = 'lazy';
  picture.appendChild(img);
  media.appendChild(picture);

  const identity = doc.createElement('div');
  identity.className = 'profile-cards__identity';

  const nameEl = doc.createElement('div');
  nameEl.className = 'profile-cards__name';
  nameEl.textContent = name;
  identity.appendChild(nameEl);

  const roleEl = doc.createElement('div');
  roleEl.className = 'profile-cards__role';
  roleEl.textContent = designation;
  identity.appendChild(roleEl);

  header.appendChild(media);
  header.appendChild(identity);

  const body = doc.createElement('div');
  body.className = 'profile-cards__body';

  const orgEl = doc.createElement('div');
  orgEl.className = 'profile-cards__org';
  orgEl.textContent = division;
  body.appendChild(orgEl);

  const descEl = doc.createElement('div');
  descEl.className = 'profile-cards__description';
  descEl.textContent = description;
  body.appendChild(descEl);

  const footer = doc.createElement('div');
  footer.className = 'profile-cards__footer';
  const cta = doc.createElement('div');
  cta.className = 'profile-cards__cta';
  const a = doc.createElement('a');
  a.href = ctaHref;
  a.textContent = ctaLabel;
  cta.appendChild(a);
  footer.appendChild(cta);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);

  return card;
}

/** Same grid as {@link decorateProfileCardsMarkup}: two cards per `.profile-cards__row`. */
function buildProfileCardsHtmlFromSheetRows(rows: ProfileCardsSheetRow[]): string {
  const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
  const root = doc.createElement('div');
  root.className = 'profile-cards';

  chunkPairs(rows).forEach((pair) => {
    const rowEl = doc.createElement('div');
    rowEl.className = 'profile-cards__row';
    pair.forEach((item) => rowEl.appendChild(buildCardFromSheetRow(item, doc)));
    root.appendChild(rowEl);
  });

  return root.outerHTML;
}

@Component({
  selector: 'profile-cards-root',
  standalone: true,
  templateUrl: './profile-cards.component.html',
  styleUrl: './profile-cards.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProfileCardsComponent implements OnInit {
  /** Served from site root (same origin as the page). */
  private static readonly DATASHEET_JSON_PATH = '/profile-cards-data.json';

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authoredHtml = inject(EDS_BLOCK_HTML, { optional: true });
  private readonly datasheetFromDom = isDatasheetBlockContext(this.el.nativeElement);

  /** `undefined` = loading; set after fetch. */
  private readonly sheetRows = signal<ProfileCardsSheetRow[] | undefined>(undefined);
  private readonly sheetError = signal<string | null>(null);

  readonly safeDecoratedHtml = computed(() => {
    const raw = this.authoredHtml?.trim() ?? '';
    const datasheet =
      this.datasheetFromDom || isProfileCardsDatasheetVariation(raw);

    if (datasheet) {
      const err = this.sheetError();
      if (err) {
        return this.sanitizer.bypassSecurityTrustHtml(
          `<div class="profile-cards profile-cards--datasheet">`
            + `<p class="profile-cards__datasheet-placeholder">${escapeHtml(err)}</p>`
            + '</div>',
        );
      }
      const rows = this.sheetRows();
      if (rows === undefined) {
        return this.sanitizer.bypassSecurityTrustHtml(
          '<div class="profile-cards profile-cards--datasheet">'
            + '<p class="profile-cards__datasheet-placeholder">Loading…</p>'
            + '</div>',
        );
      }
      if (rows.length === 0) {
        return this.sanitizer.bypassSecurityTrustHtml(
          '<div class="profile-cards profile-cards--datasheet">'
            + '<p class="profile-cards__datasheet-placeholder">No profile data.</p>'
            + '</div>',
        );
      }
      return this.sanitizer.bypassSecurityTrustHtml(buildProfileCardsHtmlFromSheetRows(rows));
    }

    if (!raw) return null;
    return this.sanitizer.bypassSecurityTrustHtml(decorateProfileCardsMarkup(raw));
  });

  ngOnInit(): void {
    const raw = this.authoredHtml?.trim() ?? '';
    const datasheet =
      this.datasheetFromDom || isProfileCardsDatasheetVariation(raw);
    if (!datasheet) return;
    void this.loadDatasheetJson();
  }

  private async loadDatasheetJson(): Promise<void> {
    this.sheetError.set(null);
    try {
      const url = new URL(ProfileCardsComponent.DATASHEET_JSON_PATH, window.location.href).href;
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = (await res.json()) as ProfileCardsSheetPayload;
      const rows = payload.data;
      if (!Array.isArray(rows)) {
        this.sheetRows.set([]);
        this.sheetError.set('Invalid datasheet response.');
        return;
      }
      this.sheetRows.set(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[profile-cards] Failed to load datasheet JSON', err);
      this.sheetError.set(message);
      this.sheetRows.set([]);
    }
  }
}

/** Escape text for safe insertion into HTML attribute or body (minimal). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
