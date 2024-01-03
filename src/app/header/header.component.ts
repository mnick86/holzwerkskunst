import {Component} from '@angular/core';
import {AppStore} from '../+store/app.store';
import {take, takeUntil} from 'rxjs';
import {Router} from '@angular/router';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  constructor(
    public store: AppStore,
    public router: Router,
  ) {}

  toggleVisiblity() {
    this.store.selectSidebarVisible$.pipe(take(1)).subscribe((visible) => {
      this.store.setSidebarVisible(!visible);
    });
  }

  home() {
    this.router.navigate(['']);
  }
}
