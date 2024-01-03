import {ChangeDetectionStrategy, Component} from '@angular/core';
import {AppStore} from '../+store/app.store';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  constructor(private store: AppStore) {}

  products$ = this.store.selectProducts$;
}
