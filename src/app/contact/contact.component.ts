import {Component} from '@angular/core';
import {AppStore} from '../+store/app.store';
import {FormControl, FormGroup, Validators} from '@angular/forms';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class ContactComponent {
  constructor(public store: AppStore) {}

  visible$ = this.store.selectShowContact$;

  hide() {
    this.store.setShowContact(false);
  }
}
