import {ChangeDetectionStrategy, Component, ViewChild} from '@angular/core';
import {MenuItem} from 'primeng/api';
import {AppStore} from './+store/app.store';
import {take, tap} from 'rxjs';
import {Router} from '@angular/router';
import {Sidebar} from 'primeng/sidebar';

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
  ) {}

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
