import { Component } from '@angular/core';
import { AppStore } from '../+store/app.store';

@Component({
  selector: 'app-start',
  templateUrl: './start.component.html',
  styleUrl: './start.component.scss'
})
export class StartComponent {

    constructor(private store: AppStore) {}

    products$ = this.store.selectProducts$;
}
