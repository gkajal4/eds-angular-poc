import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { loadFragment } from '@eds/blocks/fragment';
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

@Component({
  selector: 'profile-cards-root',
  standalone: true,
  templateUrl: './profile-cards.component.html',
  styleUrl: './profile-cards.component.scss'
})
export class ProfileCardsComponent implements OnInit {
  /** Served from site root (same origin as the page). */
  private static readonly DATASHEET_JSON_PATH = '/profile-cards-data.json';
  /** Index listing JSON (EDS). */
  private static readonly PROFILES_INDEX_JSON_PATH = '/profiles-index.json';

  /** Sheet column keys from AEM (includes typo `devision`). */
  private static readonly SHEET_KEY_IMAGE = 'profile image';
  private static readonly SHEET_KEY_NAME = 'name';
  private static readonly SHEET_KEY_DESIGNATION = 'designation';
  private static readonly SHEET_KEY_DIVISION = 'devision';
  private static readonly SHEET_KEY_DIVISION_ALT = 'division';
  private static readonly SHEET_KEY_DESCRIPTION = 'description';
  private static readonly SHEET_KEY_CTA_LABEL = 'learn more label';
  private static readonly SHEET_KEY_CTA_LINK = 'learn more link';

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authoredHtml = inject(EDS_BLOCK_HTML, { optional: true });
  private readonly indexFromDom = this.isIndexBlockContext(this.el.nativeElement);
  private readonly datasheetFromDom = this.isDatasheetBlockContext(this.el.nativeElement);

  /** `undefined` = loading; set after fetch. */
  private readonly sheetRows = signal<ProfileCardsSheetRow[] | undefined>(undefined);
  private readonly sheetError = signal<string | null>(null);

  /** Index variation: rows built from `loadFragment` HTML (`undefined` = loading). */
  private readonly indexProfileRows = signal<ProfileCardsSheetRow[] | undefined>(undefined);
  private readonly indexError = signal<string | null>(null);

  readonly safeDecoratedHtml = computed(() => {
    const raw = this.authoredHtml?.trim() ?? '';
    const index = this.indexFromDom || this.isProfileCardsIndexVariation(raw);
    const datasheet =
      !index && (this.datasheetFromDom || this.isProfileCardsDatasheetVariation(raw));

    if (index) {
      const err = this.indexError();
      if (err) {
        return this.sanitizer.bypassSecurityTrustHtml(
          `<div class="profile-cards profile-cards--index">`
            + `<p class="profile-cards__index-placeholder">${this.escapeHtml(err)}</p>`
            + '</div>',
        );
      }
      const idxRows = this.indexProfileRows();
      if (idxRows === undefined) {
        return this.sanitizer.bypassSecurityTrustHtml(
          '<div class="profile-cards profile-cards--index">'
            + '<p class="profile-cards__index-placeholder">Loading…</p>'
            + '</div>',
        );
      }
      if (idxRows.length === 0) {
        return this.sanitizer.bypassSecurityTrustHtml(
          '<div class="profile-cards profile-cards--index">'
            + '<p class="profile-cards__index-placeholder">No profile data.</p>'
            + '</div>',
        );
      }
      return this.sanitizer.bypassSecurityTrustHtml(this.buildProfileCardsHtmlFromSheetRows(idxRows));
    }

    if (datasheet) {
      const err = this.sheetError();
      if (err) {
        return this.sanitizer.bypassSecurityTrustHtml(
          `<div class="profile-cards profile-cards--datasheet">`
            + `<p class="profile-cards__datasheet-placeholder">${this.escapeHtml(err)}</p>`
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
      return this.sanitizer.bypassSecurityTrustHtml(this.buildProfileCardsHtmlFromSheetRows(rows));
    }

    if (!raw) return null;
    return this.sanitizer.bypassSecurityTrustHtml(this.decorateProfileCardsMarkup(raw));
  });

  ngOnInit(): void {
    const raw = this.authoredHtml?.trim() ?? '';
    const index = this.indexFromDom || this.isProfileCardsIndexVariation(raw);
    if (index) {
      void this.loadProfilesIndexJson();
      return;
    }
    const datasheet =
      this.datasheetFromDom || this.isProfileCardsDatasheetVariation(raw);
    if (!datasheet) return;
    void this.loadDatasheetJson();
  }

  /**
   * Fetches index JSON, loads each `path` via {@link loadFragment}, parses six-paragraph profile
   * markup into sheet-shaped rows, and drives the same card grid as datasheet.
   */
  private async loadProfilesIndexJson(): Promise<void> {
    this.indexError.set(null);
    this.indexProfileRows.set(undefined);
    try {
      const url = new URL(ProfileCardsComponent.PROFILES_INDEX_JSON_PATH, window.location.href).href;
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = (await res.json()) as { data?: unknown };
      if (!Array.isArray(payload.data)) {
        this.indexProfileRows.set([]);
        this.indexError.set('Invalid index response.');
        return;
      }
      const rows = payload.data as Array<{ path?: string }>;
      const indexed = await Promise.all(
        rows.map(async (row, rowIndex) => {
          const path = typeof row.path === 'string' ? row.path.trim() : '';
          if (!path) {
            console.warn('[profile-cards] profiles-index row missing path', row);
            return { rowIndex, profileRow: null as ProfileCardsSheetRow | null };
          }
          const fragment = await loadFragment(path);
          if (!fragment) {
            console.warn('[profile-cards] loadFragment returned null', path);
            return { rowIndex, profileRow: null };
          }
          const profileRow = this.fragmentMainToProfileRow(fragment);
          if (!profileRow) {
            console.warn('[profile-cards] could not parse profile fragment', path);
            return { rowIndex, profileRow: null };
          }
          return { rowIndex, profileRow };
        }),
      );
      indexed.sort((a, b) => a.rowIndex - b.rowIndex);
      const profileRows = indexed
        .map((x) => x.profileRow)
        .filter((r): r is ProfileCardsSheetRow => r !== null);
      this.indexProfileRows.set(profileRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[profile-cards] Failed to load profiles index', err);
      this.indexError.set(message);
      this.indexProfileRows.set([]);
    }
  }

  /**
   * Finds a `div` whose direct children include at least six `<p>` nodes (profile fragment shape).
   */
  private findProfileFragmentColumn(scope: HTMLElement): HTMLElement | null {
    const divs = scope.querySelectorAll('div');
    for (let i = 0; i < divs.length; i += 1) {
      const div = divs[i] as HTMLElement;
      const ps = this.getDirectChildPs(div);
      if (ps.length >= 6) return div;
    }
    return null;
  }

  /**
   * Parses loaded fragment `<main>`: inner column with six `<p>` — image, name, designation,
   * division, description, learn more (matches {@link buildCard} cell order).
   */
  private fragmentMainToProfileRow(main: HTMLElement): ProfileCardsSheetRow | null {
    const root = this.findProfileFragmentColumn(main);
    if (!root) return null;
    const ps = this.getDirectChildPs(root);
    if (ps.length < 6) return null;
    const [pPic, pName, pTitle, pOrg, pDesc, pLink] = ps;

    let imageUrl = '';
    const pictureEl = pPic?.querySelector('picture');
    if (pictureEl) {
      const img = pictureEl.querySelector('img');
      if (img instanceof HTMLImageElement) {
        imageUrl = (img.currentSrc || img.src || '').trim();
      }
    }
    if (!imageUrl) {
      const a = pPic?.querySelector('a');
      if (a instanceof HTMLAnchorElement) {
        imageUrl = a.href.trim();
      }
    }

    const row: ProfileCardsSheetRow = {
      [ProfileCardsComponent.SHEET_KEY_IMAGE]: imageUrl,
      [ProfileCardsComponent.SHEET_KEY_NAME]: pName?.textContent?.trim() ?? '',
      [ProfileCardsComponent.SHEET_KEY_DESIGNATION]: pTitle?.textContent?.trim() ?? '',
      [ProfileCardsComponent.SHEET_KEY_DIVISION]: pOrg?.textContent?.trim() ?? '',
      [ProfileCardsComponent.SHEET_KEY_DESCRIPTION]: pDesc?.textContent?.trim() ?? '',
    };
    const linkA = pLink?.querySelector('a');
    if (linkA instanceof HTMLAnchorElement) {
      row[ProfileCardsComponent.SHEET_KEY_CTA_LINK] = linkA.href;
      row[ProfileCardsComponent.SHEET_KEY_CTA_LABEL] = linkA.textContent?.trim() ?? 'Learn more';
    } else {
      row[ProfileCardsComponent.SHEET_KEY_CTA_LINK] = '#';
      row[ProfileCardsComponent.SHEET_KEY_CTA_LABEL] = pLink?.textContent?.trim() ?? 'Learn more';
    }
    return row;
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

  /**
   * `datasheet` is on the EDS `.block` host or parent (not always present in `EDS_BLOCK_HTML`).
   */
  private isDatasheetBlockContext(host: HTMLElement): boolean {
    if (host.classList.contains('datasheet')) return true;
    if (host.parentElement?.classList.contains('datasheet')) return true;
    const block = host.closest('.block');
    return block instanceof HTMLElement && block.classList.contains('datasheet');
  }

  /**
   * `index` is on the EDS `.block` host or parent (not always present in `EDS_BLOCK_HTML`).
   */
  private isIndexBlockContext(host: HTMLElement): boolean {
    if (host.classList.contains('index')) return true;
    if (host.parentElement?.classList.contains('index')) return true;
    const block = host.closest('.block');
    return block instanceof HTMLElement && block.classList.contains('index');
  }

  /** EDS may send `<div class="profile-cards index">…</div>`. */
  private isProfileCardsIndexVariation(html: string): boolean {
    const doc = new DOMParser().parseFromString(html.trim(), 'text/html');
    if (doc.body.querySelector('.profile-cards.index')) return true;
    const root = doc.body.querySelector('.profile-cards') ?? doc.body.firstElementChild;
    return (
      root instanceof HTMLElement
      && root.classList.contains('profile-cards')
      && root.classList.contains('index')
    );
  }

  /** EDS may send `<div class="profile-cards datasheet">…</div>` — separate handling from default cards. */
  private isProfileCardsDatasheetVariation(html: string): boolean {
    const doc = new DOMParser().parseFromString(html.trim(), 'text/html');
    if (doc.body.querySelector('.profile-cards.datasheet')) return true;
    const root = doc.body.querySelector('.profile-cards') ?? doc.body.firstElementChild;
    return (
      root instanceof HTMLElement
      && root.classList.contains('profile-cards')
      && root.classList.contains('datasheet')
    );
  }

  private isCardShellEmpty(card: HTMLElement): boolean {
    if (card.querySelector('picture')) return false;
    const t = card.textContent?.replace(/\s/g, '') ?? '';
    return t.length === 0;
  }

  private getDirectChildPs(el: HTMLElement): HTMLParagraphElement[] {
    return [...el.children].filter((c): c is HTMLParagraphElement => c.tagName === 'P');
  }

  /**
   * Column divs that match EDS profile shape: ≥5 direct &lt;p&gt;, first has &lt;picture&gt;.
   */
  private findColumnDivs(scope: Element): HTMLElement[] {
    const candidates: HTMLElement[] = [];
    scope.querySelectorAll('div').forEach((div) => {
      const ps = this.getDirectChildPs(div as HTMLElement);
      if (ps.length < 5) return;
      if (!ps[0]?.querySelector('picture')) return;
      candidates.push(div as HTMLElement);
    });
    return candidates.filter((d) => !candidates.some((other) => other !== d && d.contains(other)));
  }

  /**
   * One EDS column cell → card markup (divs only; picture / anchor preserved).
   */
  private buildCard(column: HTMLElement, doc: Document): HTMLElement | null {
    if (this.isCardShellEmpty(column)) return null;

    const ps = this.getDirectChildPs(column);
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
  private decorateProfileCardsMarkup(html: string): string {
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
          const card = this.buildCard(colEl, doc);
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

      this.findColumnDivs(rootEl).forEach((colEl) => {
        const card = this.buildCard(colEl, doc);
        if (card) flatRow.appendChild(card);
      });

      if (flatRow.children.length > 0) {
        out.appendChild(flatRow);
      }
    }

    return out.outerHTML;
  }

  private chunkPairs<T>(items: T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += 2) {
      out.push(items.slice(i, i + 2));
    }
    return out;
  }

  /**
   * One sheet row → same DOM as {@link buildCard} (media, identity, body, CTA).
   */
  private buildCardFromSheetRow(row: ProfileCardsSheetRow, doc: Document): HTMLElement {
    const imgSrc = (row[ProfileCardsComponent.SHEET_KEY_IMAGE] ?? '').trim();
    const name = (row[ProfileCardsComponent.SHEET_KEY_NAME] ?? '').trim();
    const designation = (row[ProfileCardsComponent.SHEET_KEY_DESIGNATION] ?? '').trim();
    const division = (
      row[ProfileCardsComponent.SHEET_KEY_DIVISION]
      ?? row[ProfileCardsComponent.SHEET_KEY_DIVISION_ALT]
      ?? ''
    ).trim();
    const description = (row[ProfileCardsComponent.SHEET_KEY_DESCRIPTION] ?? '').trim();
    const ctaLabel = (row[ProfileCardsComponent.SHEET_KEY_CTA_LABEL] ?? 'Learn more').trim();
    const ctaHref = (row[ProfileCardsComponent.SHEET_KEY_CTA_LINK] ?? '#').trim();

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
  private buildProfileCardsHtmlFromSheetRows(rows: ProfileCardsSheetRow[]): string {
    const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
    const root = doc.createElement('div');
    root.className = 'profile-cards';

    this.chunkPairs(rows).forEach((pair) => {
      const rowEl = doc.createElement('div');
      rowEl.className = 'profile-cards__row';
      pair.forEach((item) => rowEl.appendChild(this.buildCardFromSheetRow(item, doc)));
      root.appendChild(rowEl);
    });

    return root.outerHTML;
  }

  /** Escape text for safe insertion into HTML attribute or body (minimal). */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
