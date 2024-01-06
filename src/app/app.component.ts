import {ChangeDetectionStrategy, Component, ViewChild} from '@angular/core';
import {MenuItem} from 'primeng/api';
import {AppStore} from './+store/app.store';
import {take, tap} from 'rxjs';
import {Router} from '@angular/router';
import {Sidebar} from 'primeng/sidebar';
import {Meta} from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  @ViewChild('sidebar')
  sidebar: Sidebar | undefined;

  constructor(
    public store: AppStore,
    public router: Router,
    public meta: Meta,
  ) {
    meta.addTag({property: 'og:title', content: 'Holzwerkskunst.de'});
    meta.addTag({property: 'og:type', content: 'website'});
    meta.addTag({
      name: 'og:description',
      content: 'Kreative Holzarbeiten auf Holzwerkskunst.de',
    });
    meta.addTag({property: 'og:site_name', content: 'Holzwerkskunst.de'});
    meta.addTag({property: 'og:url', content: 'https://www.Holzwerkskunst.de'});
    meta.addTag({
      name: 'og:image',
      content: 'https://holzwerkskunst.de/glubbal/10__400_400.jpg',
    }); // TODO fix me later
  }

  sidebarVisible$ = this.store.selectSidebarVisible$.pipe(
    tap((visible) => {
      if (!visible) {
        this.sidebar?.destroyModal();
      }
    }),
  );
  tags$ = this.store.selectTags$;

  visibleChange(visible: boolean) {
    this.store.setSidebarVisible(visible);
  }

  navigateTo(link: string) {
    this.store.setSidebarVisible(false);
    this.router.navigate([link]);
  }

  navigateToTag(tag: string) {
    this.store.setSidebarVisible(false);
    this.router.navigate(['/produkte', tag]);
  }

  contact() {
    this.store.setShowContact(true);
  }
}
